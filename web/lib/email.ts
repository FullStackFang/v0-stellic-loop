import { Resend } from "resend";
import { required } from "@/lib/supabase/env";

/**
 * Outbound app email (design.md "Emails via Resend"). One `sendEmail` for
 * every app-sent message; the loop footer below is what watching-digest
 * "Only Loop-originated transactional email" requires on each of them.
 *
 * Under Vitest, and in non-production when `RESEND_API_KEY` is unset, sends
 * go to an in-memory stub (`sentEmails`) instead of Resend, so tests and a
 * bare local checkout never mail anyone. Production without the key throws.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SentEmail = EmailMessage & { from: string };

/** Every message the stub accepted, oldest first. Empty outside the stub. */
export const sentEmails: SentEmail[] = [];

export function resetSentEmails(): void {
  sentEmails.length = 0;
}

function isStubbed(): boolean {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return true;
  return process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY;
}

let client: Resend | null = null;

function resend(): Resend {
  if (!client) client = new Resend(required("RESEND_API_KEY", process.env.RESEND_API_KEY));
  return client;
}

/** The slice of the Resend client the sender uses. */
export interface ResendLike {
  emails: {
    send(payload: SentEmail): Promise<{
      error: { name: string; message: string; statusCode?: number | null } | null;
      headers?: Record<string, string> | null;
    }>;
  };
}

export interface ResendSenderDeps {
  client: () => ResendLike;
  /** Milliseconds; injectable so tests run on a fake clock. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Minimum spacing between sends (Resend allows about 2 requests per second). */
  minGapMs?: number;
}

export const MIN_SEND_GAP_MS = 550;
const DEFAULT_RETRY_AFTER_MS = 1000;

function isRateLimited(error: { name: string; statusCode?: number | null }): boolean {
  return error.name === "rate_limit_exceeded" || error.statusCode === 429;
}

/** `retry-after` in seconds (Resend sends seconds), else 1 s. */
function retryAfterMs(headers: Record<string, string> | null | undefined): number {
  const raw = headers?.["retry-after"];
  const seconds = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
}

/**
 * The real Resend path: every send takes the next slot of a throttle that
 * spaces sends at least `minGapMs` apart (slots are reserved synchronously,
 * so concurrent callers queue too), and a 429 is retried once after
 * `retry-after`. The 429 backoff is shared: it pauses the whole queue, so a
 * concurrent send already holding a slot waits it out as well. Throws when
 * Resend rejects the message, or rate-limits twice.
 */
export function createResendSender(deps: ResendSenderDeps): (payload: SentEmail) => Promise<void> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const gap = deps.minGapMs ?? MIN_SEND_GAP_MS;
  let nextAt = 0;
  /** Set by a 429: nothing goes out before this, not even a slot handed out earlier. */
  let pausedUntil = 0;

  async function takeSlot(): Promise<void> {
    for (;;) {
      const t = now();
      const at = Math.max(t, nextAt);
      nextAt = at + gap;
      if (at > t) await sleep(at - t);
      if (at >= pausedUntil) return;
      // A 429 landed while this caller was waiting: queue again behind the pause.
    }
  }

  return async function send(payload: SentEmail): Promise<void> {
    await takeSlot();
    let res = await deps.client().emails.send(payload);
    if (res.error && isRateLimited(res.error)) {
      // Pause the queue for everyone, then take a fresh slot behind the pause.
      pausedUntil = now() + retryAfterMs(res.headers);
      nextAt = Math.max(nextAt, pausedUntil);
      await takeSlot();
      res = await deps.client().emails.send(payload);
    }
    if (res.error) throw new Error(`Resend: ${res.error.name}: ${res.error.message}`);
  };
}

const sendViaResend = createResendSender({ client: resend });

/** Sends one message from `EMAIL_FROM`. Throws when Resend rejects it. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const from = required("EMAIL_FROM", process.env.EMAIL_FROM);
  if (isStubbed()) {
    sentEmails.push({ from, ...message });
    return;
  }
  await sendViaResend({
    from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}

// ---------------------------------------------------------------------------
// Shared pieces for templates
// ---------------------------------------------------------------------------

/** Escapes text for an HTML body or attribute value. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface LoopFooterInput {
  loopTitle: string;
  organizerFirstName: string;
  /** The loop's public page, `${APP_URL}/l/<slug>`. */
  loopUrl: string;
  /** `${APP_URL}/l/<slug>/leave`: a signed-in confirm page. */
  leaveUrl: string;
}

/** Names the loop and organizer, links the loop page, and links leaving. */
export function loopFooterHtml(input: LoopFooterInput): string {
  const title = escapeHtml(input.loopTitle);
  const organizer = escapeHtml(input.organizerFirstName);
  const loopUrl = escapeHtml(input.loopUrl);
  const leaveUrl = escapeHtml(input.leaveUrl);
  return (
    `<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #ddd;font-size:12px;color:#666">` +
    `You're getting this because you joined <a href="${loopUrl}">${title}</a>, organized by ${organizer}. ` +
    `<a href="${leaveUrl}">Leave this loop</a>.` +
    `</p>`
  );
}

export function loopFooterText(input: LoopFooterInput): string {
  return (
    `--\n` +
    `You're getting this because you joined ${input.loopTitle}, organized by ${input.organizerFirstName}.\n` +
    `Loop page: ${input.loopUrl}\n` +
    `Leave this loop: ${input.leaveUrl}`
  );
}
