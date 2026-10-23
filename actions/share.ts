"use server";
import { db } from "@/lib/db";
import { writeEvent } from "@/lib/events";
import { sessionPersonId } from "@/lib/identity";
import { proposalById } from "@/lib/load";
import { limited } from "@/lib/ratelimit";
import { shareToken } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import { fail, type Fail } from "./results";

export type ShareResult = { status: "ok"; url: string } | Fail;

/** Every share is a fresh URL, so chat apps fetch a fresh preview; who and when are recorded. */
export async function share(input: { proposalId: string }): Promise<ShareResult> {
  if (await limited("share")) return fail("rate_limited");
  const me = await sessionPersonId();
  return db().tx(async (q) => {
    const p = await proposalById(q, input.proposalId);
    if (!p) return fail("not_found");
    const token = shareToken();
    const { rows } = await q.query<{ id: string }>(
      "insert into share (proposal_id, token, sharer_id) values ($1, $2, $3) returning id", [p.id, token, me]);
    await writeEvent(q, { boardId: p.board_id, proposalId: p.id, personId: me, type: "share_minted", source: "direct", shareId: rows[0].id });
    return { status: "ok" as const, url: appUrl(`/p/${p.id}?s=${token}`) };
  });
}
