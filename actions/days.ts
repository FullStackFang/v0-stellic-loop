"use server";
import { db } from "@/lib/db";
import { isValidDay } from "@/lib/days";
import { attribution, joinBoard, sessionPersonId, setSession } from "@/lib/identity";
import { boardById, personConflicts, proposalById } from "@/lib/load";
import { fail, type Fail } from "./results";

export type DaysResult = { status: "ok" } | Fail;

/**
 * Mark or unmark a free day for the board's window. The change follows the
 * person onto every open, needs-a-day proposal they are in on; never onto ON.
 */
export async function setFreeDay(input: { boardId: string; day: string; free: boolean }): Promise<DaysResult> {
  const me = await sessionPersonId();
  if (!me) return fail("signed_out");
  const out = await db().tx(async (q) => {
    const board = await boardById(q, input.boardId);
    if (!board) return fail("not_found");
    if (!isValidDay(input.day) || input.day < board.window_start || input.day > board.window_end) return fail("bad_day");
    if (input.free) {
      await q.query("insert into free_day (board_id, person_id, day) values ($1, $2, $3) on conflict do nothing", [board.id, me, input.day]);
      const conflict = (await personConflicts(q, board.id, me)).get(input.day);
      await q.query(
        `update response r set days = array(select unnest(r.days || $3::date) order by 1), updated_at = now()
         from proposal p
         where p.id = r.proposal_id and p.board_id = $1 and r.person_id = $2 and r.answer = 'in'
           and p.status = 'open' and p.needs_day and not ($3::date = any(r.days))
           and ($4::uuid is null or p.id = $4::uuid)`,
        [board.id, me, input.day, conflict?.id ?? null],
      );
    } else {
      await q.query("delete from free_day where board_id = $1 and person_id = $2 and day = $3", [board.id, me, input.day]);
      await q.query(
        `update response r set days = array_remove(r.days, $3::date), updated_at = now()
         from proposal p
         where p.id = r.proposal_id and p.board_id = $1 and r.person_id = $2 and r.answer = 'in'
           and p.status = 'open' and p.needs_day`,
        [board.id, me, input.day],
      );
    }
    await joinBoard(q, board.id, me, null, await attribution(q));
    return { status: "ok" as const };
  });
  if (out.status === "ok") await setSession(me);
  return out;
}

/** Adjust one day on one proposal only; free days are untouched. */
export async function setProposalDay(input: { proposalId: string; day: string; on: boolean }): Promise<DaysResult> {
  const me = await sessionPersonId();
  if (!me) return fail("signed_out");
  const out = await db().tx(async (q) => {
    const p = await proposalById(q, input.proposalId, true);
    if (!p) return fail("not_found");
    const board = (await boardById(q, p.board_id))!;
    if (!isValidDay(input.day) || input.day < board.window_start || input.day > board.window_end) return fail("bad_day");
    if (p.status !== "open" || !p.needs_day) return fail("not_ready");
    const sql = input.on
      ? `update response set days = array(select unnest(days || $3::date) order by 1), updated_at = now()
         where proposal_id = $1 and person_id = $2 and answer = 'in' and not ($3::date = any(days)) returning 1`
      : `update response set days = array_remove(days, $3::date), updated_at = now()
         where proposal_id = $1 and person_id = $2 and answer = 'in' returning 1`;
    const { rows } = await q.query(sql, [p.id, me, input.day]);
    if (!rows.length) {
      const { rows: mine } = await q.query("select 1 from response where proposal_id = $1 and person_id = $2 and answer = 'in'", [p.id, me]);
      if (!mine.length) return fail("not_in");
    }
    return { status: "ok" as const };
  });
  if (out.status === "ok") await setSession(me);
  return out;
}
