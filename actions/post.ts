"use server";
import { db } from "@/lib/db";
import { attribution, setSession, withIdentity } from "@/lib/identity";
import { boardBySlug } from "@/lib/load";
import { parsePost, postAs, postRefusal, type PostInput } from "@/lib/ops";
import { limited } from "@/lib/ratelimit";
import { fail, fromWho, type Fail, type NeedsCode } from "./results";

export type PostResult = { status: "ok"; proposalId: string } | NeedsCode | Fail;

export async function post(input: PostInput & { slug: string; name?: string; phone?: string }): Promise<PostResult> {
  // Validate before asking for identity so a stranger never verifies for a post that would fail.
  const v = parsePost(input);
  if ("error" in v) return fail(v.error!);
  if (await limited("identify", input.phone)) return fail("rate_limited");
  const out = await db().tx(async (q) => {
    const board = await boardBySlug(q, input.slug);
    if (!board) return fail("not_found");
    const refused = postRefusal(board, v.needsDay);
    if (refused) return fail(refused);
    const fields: PostInput = {
      title: input.title, icon: input.icon, needsDay: input.needsDay, detail: input.detail,
      cost: input.cost, time: input.time, min: input.min, links: input.links, versionOf: input.versionOf,
    };
    const who = await withIdentity(q, input, { boardId: board.id, pending: { kind: "post", boardId: board.id, post: fields } });
    if (who.kind === "error" || who.kind === "needs_code") return fromWho(who);
    const r = await postAs(q, who.personId, board.id, fields, await attribution(q));
    if (r.status === "error") return fail(r.error);
    return { ...r, personId: who.personId };
  });
  if (out.status !== "ok") return out;
  await setSession(out.personId);
  return { status: "ok", proposalId: out.proposalId };
}
