"use server";
import { db, type Q } from "@/lib/db";
import { notifyDropped, notifyOneMore } from "@/lib/after";
import { attribution, CODE_ATTEMPTS, setSession, type Pending } from "@/lib/identity";
import { createBoardAs, postAs, respondAs } from "@/lib/ops";
import { checkVerification, verifyConfig, type CheckResult } from "@/lib/notify/verify";
import { normalizePhone } from "@/lib/phone";
import { limited } from "@/lib/ratelimit";
import { sessionSecret } from "@/lib/session";
import { hashCode } from "@/lib/tokens";
import { timingSafeEqual } from "node:crypto";
import { fail, type Fail } from "./results";

/** `path`: where the replayed action lands (the proposal or the new board), or null. */
export type VerifyResult = { status: "ok"; path: string | null } | Fail;

/**
 * Checks the code (with Twilio Verify when it sent it), creates the person if
 * the number is new, then records what they were trying to do.
 */
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
    const check = await checkCode(phone, code, row.code_hash);
    if (check === "failed") return fail("code_check_failed");
    if (check === "expired") {
      await q.query("delete from otp_code where phone = $1", [phone]);
      return fail("expired");
    }
    if (check === "wrong") {
      if (row.attempts + 1 >= CODE_ATTEMPTS) {
        await q.query("delete from otp_code where phone = $1", [phone]);
        return fail("too_many");
      }
      await q.query("update otp_code set attempts = attempts + 1 where phone = $1", [phone]);
      return fail("wrong_code");
    }
    await q.query("delete from otp_code where phone = $1", [phone]);
    const pending = row.pending;
    const personId = await personFor(q, phone, pending?.person);
    if (!personId) return fail("expired");
    const attr = await attribution(q);
    if (pending?.kind === "respond") {
      const r = await respondAs(q, personId, pending.proposalId, pending.answer, attr, "set");
      const ok = r.status === "ok" ? r : null;
      return { status: "ok" as const, personId, path: `/p/${pending.proposalId}`, dropped: ok?.dropped ?? null, oneMore: ok?.oneMore ?? null };
    }
    if (pending?.kind === "post") {
      const r = await postAs(q, personId, pending.boardId, pending.post, attr);
      return { status: "ok" as const, personId, path: r.status === "ok" ? `/p/${r.proposalId}` : null, dropped: null, oneMore: null };
    }
    if (pending?.kind === "board") {
      const r = await createBoardAs(q, personId, pending.name, pending.tz);
      return { status: "ok" as const, personId, path: r.status === "ok" ? `/b/${r.slug}` : null, dropped: null, oneMore: null };
    }
    return { status: "ok" as const, personId, path: null, dropped: null, oneMore: null };
  });
  if (out.status !== "ok") return out;
  await setSession(out.personId);
  if (out.dropped) await notifyDropped(out.dropped.proposal, out.personId, out.dropped.count);
  if (out.oneMore) await notifyOneMore(out.oneMore.proposal, out.oneMore.count);
  return { status: "ok", path: out.path };
}

/** Verify sent the code when it is configured, so only Verify can check it; otherwise the stored hash. */
async function checkCode(phone: string, code: string, codeHash: string): Promise<CheckResult> {
  const cfg = verifyConfig(process.env);
  if (cfg) return checkVerification(cfg, phone, code);
  const want = Buffer.from(codeHash);
  const got = Buffer.from(hashCode(phone, code, sessionSecret()));
  return want.length === got.length && timingSafeEqual(want, got) ? "approved" : "wrong";
}

/** The person with this number, created with `name` if there is none yet. The otp_code row lock serialises callers. */
async function personFor(q: Q, phone: string, name: string | undefined): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>("select id from person where phone = $1", [phone]);
  if (rows[0]) return rows[0].id;
  if (!name) return null;
  const { rows: made } = await q.query<{ id: string }>(
    "insert into person (phone, name) values ($1, $2) returning id", [phone, name]);
  return made[0].id;
}
