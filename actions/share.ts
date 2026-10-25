"use server";
import { db } from "@/lib/db";
import { sessionPersonId } from "@/lib/identity";
import { proposalById } from "@/lib/load";
import { mintShare } from "@/lib/ops";
import { limited } from "@/lib/ratelimit";
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
    return { status: "ok" as const, url: appUrl(await mintShare(q, p, me)) };
  });
}
