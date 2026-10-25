// Twilio's Messages API through a Messaging Service, which answers STOP/START/HELP itself.
import type { Q } from "../db";
import { TextNotifier, type Transport } from "./text";

export type TwilioConfig = { accountSid: string; authToken: string; messagingServiceSid: string };

/** All three variables, or null (and the log notifier runs). */
export function twilioConfig(env: Record<string, string | undefined>): TwilioConfig | null {
  const { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken, TWILIO_MESSAGING_SERVICE_SID: messagingServiceSid } = env;
  return accountSid && authToken && messagingServiceSid ? { accountSid, authToken, messagingServiceSid } : null;
}

/** Never throws: a refused or unreachable send is `failed` with Twilio's error code, or `network`. */
export function twilioTransport(cfg: TwilioConfig): Transport {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const auth = `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`;
  return {
    channel: "sms",
    async send(to, body) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ To: to, MessagingServiceSid: cfg.messagingServiceSid, Body: body }),
          signal: AbortSignal.timeout(10_000),
        });
        const j = (await res.json().catch(() => ({}))) as { sid?: string; code?: number };
        return res.ok ? { status: "sent", sid: j.sid ?? null } : { status: "failed", error: String(j.code ?? res.status) };
      } catch {
        return { status: "failed", error: "network" };
      }
    },
  };
}

export class TwilioNotifier extends TextNotifier {
  constructor(q: Q, cfg: TwilioConfig) {
    super(q, twilioTransport(cfg));
  }
}
