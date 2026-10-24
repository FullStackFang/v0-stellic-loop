"use server";
import { db } from "@/lib/db";
import { notifyDropped } from "@/lib/after";
import { attribution, CODE_ATTEMPTS, setSession, type Pending } from "@/lib/identity";
import { createBoardAs, postAs, respondAs } from "@/lib/ops";
import { normalizePhone } from "@/lib/phone";
import { limited } from "@/lib/ratelimit";
import { sessionSecret } from "@/lib/session";
import { hashCode } from "@/lib/tokens";
import { timingSafeEqual } from "node:crypto";
import { fail, type Fail } from "./results";

/** `path`: where the replayed action lands (the proposal or the new board), or null. */
export type VerifyResult = { status: "ok"; path: string | null } | Fail;

/** Checks the code for a known number, then records what they were trying to do. */
export async function verifyCode(input: { phone: string; code: string }): Promise<VerifyResult> {
  const phone = normalizePhone(input.phone ?? "");
  if (!phone) return fail("bad_phone");
  if (await limited("verify", phone)) return fail("rate_limited");
  const code = String(input.code ?? "").replace(/\D/g, "");

  const out = await db().tx(async (q) => {
    const { rows } = await q.query<{ code_hash: string; expires_at: string; attempts: number; pending: Pending | null }>(
      "select code_hash, expires_at, attempts, pending from otp_code where phone = $1 for update", [phone]);
    const row = rows[0];
    if (!row) return fail("expired");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await q.query("delete from otp_code where phone = $1", [phone]);
      return fail("expired");
    }
    const want = Buffer.from(row.code_hash);
    const got = Buffer.from(hashCode(phone, code, sessionSecret()));
    if (want.length !== got.length || !timingSafeEqual(want, got)) {
      if (row.attempts + 1 >= CODE_ATTEMPTS) {
        await q.query("delete from otp_code where phone = $1", [phone]);
        return fail("too_many");
      }
      await q.query("update otp_code set attempts = attempts + 1 where phone = $1", [phone]);
      return fail("wrong_code");
    }
    await q.query("delete from otp_code where phone = $1", [phone]);
    const { rows: people } = await q.query<{ id: string }>("select id from person where phone = $1", [phone]);
    const personId = people[0].id;
    const attr = await attribution(q);
    const pending = row.pending;
    if (pending?.kind === "respond") {
      const r = await respondAs(q, personId, pending.proposalId, pending.answer, attr, "set");
      return { status: "ok" as const, personId, path: `/p/${pending.proposalId}`, dropped: r.status === "ok" ? r.dropped : null };
    }
    if (pending?.kind === "post") {
      const r = await postAs(q, personId, pending.boardId, pending.post, attr);
      return { status: "ok" as const, personId, path: r.status === "ok" ? `/p/${r.proposalId}` : null, dropped: null };
    }
    if (pending?.kind === "board") {
      const r = await createBoardAs(q, personId, pending.name, pending.tz);
      return { status: "ok" as const, personId, path: r.status === "ok" ? `/b/${r.slug}` : null, dropped: null };
    }
    return { status: "ok" as const, personId, path: null, dropped: null };
  });
  if (out.status !== "ok") return out;
  await setSession(out.personId);
  if (out.dropped) await notifyDropped(out.dropped.proposal, out.personId, out.dropped.count);
  return { status: "ok", path: out.path };
}
