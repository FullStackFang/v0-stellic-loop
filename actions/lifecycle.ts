"use server";
import { db } from "@/lib/db";
import { attribution, sessionPersonId, setSession } from "@/lib/identity";
import { writeEvent } from "@/lib/events";
import { proposalById } from "@/lib/load";

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
    if (p.status !== "open") return fail("closed");
    await q.query("update proposal set status = 'closed', closed_at = now() where id = $1", [p.id]);
    await writeEvent(q, { boardId: p.board_id, proposalId: p.id, personId: me, type: "proposal_closed", ...(await attribution(q)), data: { from: p.status } });
    return { status: "ok" as const };
  });
  if (out.status === "ok") await setSession(me);
  return out;
}
