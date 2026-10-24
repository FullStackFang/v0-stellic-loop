"use server";
import { db } from "@/lib/db";
import { isWindowOver, todayIn, windowOf } from "@/lib/days";
import { attribution, sessionPersonId, setSession } from "@/lib/identity";
import { writeEvent } from "@/lib/events";
import { boardById, proposalById } from "@/lib/load";
import { isIdled, minOf } from "@/lib/quorum";
import { fail, type Fail } from "./results";

/** The poster closes their proposal: it shows as past, distinct from idled, and cannot be reopened. */
export async function closeProposal(input: { proposalId: string }): Promise<{ status: "ok" } | Fail> {
  const me = await sessionPersonId();
  if (!me) return fail("signed_out");
  const out = await db().tx(async (q) => {
    const p = await proposalById(q, input.proposalId, true);
    if (!p) return fail("not_found");
    if (p.poster_id !== me) return fail("not_poster");
    if (p.status === "closed") return { status: "ok" as const };
    await q.query("update proposal set status = 'closed', closed_at = now() where id = $1", [p.id]);
    await writeEvent(q, { boardId: p.board_id, proposalId: p.id, personId: me, type: "proposal_closed", ...(await attribution(q)), data: { from: p.status } });
    return { status: "ok" as const };
  });
  if (out.status === "ok") await setSession(me);
  return out;
}

/**
 * The poster reopens an idled proposal: new minimum (lower on a fixed board;
 * the same or lower on a rolling one, since two new weeks are a fresh chance),
 * deadline to the end of the current window, answers kept,
 * `proposal_reopened` written, nothing sent.
 */
export async function reopenProposal(input: { proposalId: string; min: number }): Promise<{ status: "ok" } | Fail> {
  const me = await sessionPersonId();
  if (!me) return fail("signed_out");
  const out = await db().tx(async (q) => {
    const p = await proposalById(q, input.proposalId, true);
    if (!p) return fail("not_found");
    if (p.poster_id !== me) return fail("not_poster");
    const board = (await boardById(q, p.board_id))!;
    if (!isIdled(p, board)) return fail("not_idled");
    const min = Number(input.min);
    const rolling = board.window_kind === "rolling";
    if (!Number.isInteger(min) || min < 1 || min > minOf(p) || (!rolling && min === minOf(p))) return fail(rolling ? "not_higher" : "not_lower");
    const today = todayIn(board.tz);
    if (isWindowOver(board, today)) return fail("window_over");
    const deadline = windowOf(board, today).end;
    await q.query("update proposal set min_count = $2, deadline = $3 where id = $1", [p.id, min, deadline]);
    await writeEvent(q, {
      boardId: p.board_id, proposalId: p.id, personId: me, type: "proposal_reopened", ...(await attribution(q)),
      data: { from_min: minOf(p), to_min: min, deadline },
    });
    return { status: "ok" as const };
  });
  if (out.status === "ok") await setSession(me);
  return out;
}
