"use server";
import { db } from "@/lib/db";
import { setSession, withIdentity } from "@/lib/identity";
import { boardName, boardTz, createBoardAs } from "@/lib/ops";
import { limited } from "@/lib/ratelimit";
import { fail, fromWho, type Fail, type NeedsCode } from "./results";

export type BoardResult = { status: "ok"; slug: string } | NeedsCode | Fail;

/**
 * Start a rolling board in the visitor's timezone and land on it. `board` is
 * the board's name; `name` and `phone` are the starter's, as everywhere else.
 */
export async function startBoard(input: { board: string; tz?: string; name?: string; phone?: string }): Promise<BoardResult> {
  // Validate before asking for identity so a stranger never verifies for a board that would fail.
  const name = boardName(input.board);
  if (!name) return fail("need_board_name");
  if (await limited("board")) return fail("too_many_boards");
  if (await limited("identify", input.phone)) return fail("rate_limited");
  const tz = boardTz(input.tz);
  const out = await db().tx(async (q) => {
    const who = await withIdentity(q, input, { boardId: null, pending: { kind: "board", name, tz } });
    if (who.kind === "error" || who.kind === "needs_code") return fromWho(who);
    const r = await createBoardAs(q, who.personId, name, tz);
    if (r.status === "error") return fail(r.error);
    return { ...r, personId: who.personId };
  });
  if (out.status !== "ok") return out;
  await setSession(out.personId);
  return { status: "ok", slug: out.slug };
}
