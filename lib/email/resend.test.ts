// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { resendSender, type Mail } from './resend';

afterEach(() => { vi.useRealTimers(); });
const MAIL: Mail = { id: 'm-1', from: '"Maya via Loopd" <when@loopd.test>', to: 'josh@cornell.edu', replyTo: 'maya@cornell.edu', subject: 'On', text: 'plain', html: '<p>rich</p>', unsubscribeUrl: 'https://loopd.test/api/when/stop/abc' };
const answering = (status: number, body: unknown = {}) => { const calls: { url: string; init: RequestInit }[] = []; return { calls, fetcher: (async (url: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return new Response(JSON.stringify(body), { status }); }) as typeof fetch }; };

it('sends nothing without a key', () => { expect(resendSender({})).toBeNull(); });

it('posts the message to Resend with its id as the idempotency key', async () => {
  const { calls, fetcher } = answering(200, { id: 're_123' });
  expect(await resendSender({ RESEND_API_KEY: 'k' }, fetcher)!(MAIL)).toEqual({ ok: true, providerId: 're_123' });
  expect(calls[0].url).toBe('https://api.resend.com/emails');
  expect(calls[0].init.method).toBe('POST');
  expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer k', 'Idempotency-Key': 'm-1' });
  expect(JSON.parse(String(calls[0].init.body))).toEqual({ from: MAIL.from, to: ['josh@cornell.edu'], reply_to: 'maya@cornell.edu', subject: 'On', text: 'plain', html: '<p>rich</p>',
    headers: { 'List-Unsubscribe': '<https://loopd.test/api/when/stop/abc>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
});

it('attaches a calendar invite as invite.ics', async () => {
  const { calls, fetcher } = answering(200);
  expect(await resendSender({ RESEND_API_KEY: 'k' }, fetcher)!({ ...MAIL, calendar: { method: 'REQUEST', content: 'BEGIN:VCALENDAR' } })).toEqual({ ok: true, providerId: null });
  expect(JSON.parse(String(calls[0].init.body)).attachments).toEqual([{ filename: 'invite.ics', content: Buffer.from('BEGIN:VCALENDAR').toString('base64'), content_type: 'text/calendar; method=REQUEST; charset=utf-8' }]);
});

it('says whether trying again could work', async () => {
  const send = (status: number) => resendSender({ RESEND_API_KEY: 'k' }, answering(status).fetcher)!(MAIL);
  expect(await send(429)).toEqual({ ok: false, retry: true });
  expect(await send(500)).toEqual({ ok: false, retry: true });
  expect(await send(422)).toEqual({ ok: false, retry: false });
  expect(await resendSender({ RESEND_API_KEY: 'k' }, (async () => { throw new Error('offline'); }) as typeof fetch)!(MAIL)).toEqual({ ok: false, retry: true });
});

it('gives up on a request after five seconds', async () => {
  vi.useFakeTimers();
  const never = ((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
  const result = resendSender({ RESEND_API_KEY: 'k' }, never)!(MAIL);
  await vi.advanceTimersByTimeAsync(5000);
  expect(await result).toEqual({ ok: false, retry: true });
});
