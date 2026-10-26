// Sign-in codes through Twilio Verify, which makes the code and picks a
// registered sender itself, so Quorum needs no number of its own. Only codes
// go this way; every other message stays a log line.
import type { Q } from "../db";
import type { Code } from "./index";
import { LogNotifier, TextNotifier, type Transport } from "./text";

export type VerifyConfig = { accountSid: string; authToken: string; serviceSid: string };
export type CheckResult = "approved" | "wrong" | "expired" | "failed";

/** All three variables, or null (and codes are checked locally). */
export function verifyConfig(env: Record<string, string | undefined>): VerifyConfig | null {
  const { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken, TWILIO_VERIFY_SERVICE_SID: serviceSid } = env;
  return accountSid && authToken && serviceSid ? { accountSid, authToken, serviceSid } : null;
}

/** Never throws: `null` for a network failure. */
async function call(cfg: VerifyConfig, path: string, params: Record<string, string>) {
  try {
    const res = await fetch(`https://verify.twilio.com/v2/Services/${cfg.serviceSid}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number };
    return { ok: res.ok, status: res.status, j };
  } catch {
    return null;
  }
}

/** Starts a verification; the body is ignored because Verify writes its own. */
export function verifyTransport(cfg: VerifyConfig): Transport {
  return {
    channel: "sms",
    async send(to) {
      const r = await call(cfg, "Verifications", { To: to, Channel: "sms" });
      if (!r) return { status: "failed", error: "network" };
      return r.ok ? { status: "sent", sid: r.j.sid ?? null } : { status: "failed", error: String(r.j.code ?? r.status) };
    },
  };
}

/** Verify answers 404 once a verification is approved, expired or out of attempts. */
export async function checkVerification(cfg: VerifyConfig, to: string, code: string): Promise<CheckResult> {
  const r = await call(cfg, "VerificationCheck", { To: to, Code: code });
  if (!r) return "failed";
  if (r.status === 404) return "expired";
  if (!r.ok) return "failed";
  return r.j.status === "approved" ? "approved" : "wrong";
}

/** Codes through Verify; everything else logged, as without Twilio. */
export class VerifyNotifier extends LogNotifier {
  private codes: TextNotifier;
  constructor(q: Q, cfg: VerifyConfig, log?: (line: string) => void) {
    super(q, log);
    this.codes = new TextNotifier(q, verifyTransport(cfg));
  }

  code(m: Code) {
    return this.codes.code(m);
  }
}
