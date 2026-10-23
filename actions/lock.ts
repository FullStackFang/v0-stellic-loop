"use server";
import { db } from "@/lib/db";
import { notifyReached } from "@/lib/after";
import { sessionPersonId, setSession } from "@/lib/identity";
import { isUuid } from "@/lib/load";
import { fail, type Fail } from "./results";

export type LockResult = { status: "locked" | "already_on" } | Fail;

/** Anyone in may lock a ready proposal. The latch is lock_proposal(); the ON message goes out once. */
export async function lock(input: { proposalId: string }): Promise<LockResult> {
  const me = await sessionPersonId();
  if (!me) return fail("signed_out");
  if (!isUuid(input.proposalId)) return fail("not_found");
  const { rows } = await db().query<{ r: string }>("select lock_proposal($1, $2) r", [input.proposalId, me]);
  const r = rows[0].r;
  if (r === "locked") {
    await notifyReached(input.proposalId);
  }
  if (r === "locked" || r === "already_on") {
    await setSession(me);
    return { status: r };
  }
  return fail(r);
}
