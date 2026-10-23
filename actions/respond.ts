"use server";
import { db } from "@/lib/db";
import { attribution, setSession, withIdentity } from "@/lib/identity";
import { notifyDropped } from "@/lib/after";
import { respondAs } from "@/lib/ops";
import { limited } from "@/lib/ratelimit";
import type { Answer } from "@/lib/types";
import { fail, fromWho, type Fail, type NeedsCode } from "./results";

export type RespondResult =
  | { status: "ok"; next: Answer | null; days: string[]; conflict: { day: string; title: string } | null }
  | NeedsCode
  | Fail;

export async function respond(input: { proposalId: string; answer: Answer; name?: string; phone?: string }): Promise<RespondResult> {
  if (await limited("identify", input.phone)) return fail("rate_limited");
  const out = await db().tx(async (q) => {
    const { rows } = await q.query<{ board_id: string }>("select board_id from proposal where id::text = $1", [input.proposalId]);
    if (!rows[0]) return fail("not_found");
    const who = await withIdentity(q, input, {
      boardId: rows[0].board_id,
      pending: { kind: "respond", proposalId: input.proposalId, answer: input.answer },
    });
    if (who.kind === "error" || who.kind === "needs_code") return fromWho(who);
    const r = await respondAs(q, who.personId, input.proposalId, input.answer, await attribution(q));
    if (r.status === "error") return fail(r.error);
    return { ...r, personId: who.personId };
  });
  if (out.status !== "ok") return out;
  await setSession(out.personId);
  if (out.dropped) await notifyDropped(out.dropped.proposal, out.personId, out.dropped.count);
  return { status: "ok", next: out.next, days: out.days, conflict: out.conflict };
}
