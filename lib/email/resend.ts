// Email through Resend (https://resend.com/docs/api-reference/emails/send-email), over HTTPS with no package.
// One message per call. The message's own id is the idempotency key, so a repeat of it is the same send.

export type Mail = {
  id: string;
  /** `"Name" <address>`. */
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  /** For List-Unsubscribe, with List-Unsubscribe-Post: a POST to it stops these emails in one step. */
  unsubscribeUrl?: string;
  /** A calendar invite, attached as invite.ics. */
  calendar?: { method: 'REQUEST'; content: string };
};
/** `retry` says whether trying the same message again later could work. */
export type SendResult = { ok: true; providerId: string | null } | { ok: false; retry: boolean };
export type Sender = (mail: Mail) => Promise<SendResult>;

const GIVE_UP_MS = 5000;

/** The sender, or null when no key is set: then nothing is sent and nothing is marked failed. */
export function resendSender(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Sender | null {
  const key = env.RESEND_API_KEY;
  if (!key) return null;
  return async mail => {
    const stop = new AbortController(), timer = setTimeout(() => stop.abort(), GIVE_UP_MS);
    try {
      const answer = await fetcher('https://api.resend.com/emails', {
        method: 'POST', signal: stop.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': mail.id },
        body: JSON.stringify({
          from: mail.from, to: [mail.to], ...(mail.replyTo ? { reply_to: mail.replyTo } : {}), subject: mail.subject, text: mail.text, html: mail.html,
          ...(mail.unsubscribeUrl ? { headers: { 'List-Unsubscribe': `<${mail.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
          ...(mail.calendar ? { attachments: [{ filename: 'invite.ics', content: Buffer.from(mail.calendar.content, 'utf8').toString('base64'), content_type: `text/calendar; method=${mail.calendar.method}; charset=utf-8` }] } : {}),
        }),
      });
      if (answer.ok) { const body = await answer.json().catch(() => null) as { id?: unknown } | null; return { ok: true, providerId: typeof body?.id === 'string' ? body.id : null }; }
      return { ok: false, retry: answer.status === 429 || answer.status >= 500 };
    } catch { return { ok: false, retry: true }; } finally { clearTimeout(timer); }
  };
}
