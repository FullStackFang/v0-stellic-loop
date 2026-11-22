import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { resendSender } from '@/lib/email/resend';
import { clerkEmailOf } from '@/lib/emba/clerk-identity';
import { drainWhen, whenSendingOn } from '@/lib/when/outbox';

// Every 15 minutes, for Loopd When: tell organizers whose deadline has passed, queue the reminders that are due, and
// send what is queued. With WHEN_SENDING off, or no email provider, everything is still queued and nothing is sent.
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET, provided = Buffer.from(request.headers.get('authorization') ?? ''), expected = Buffer.from(`Bearer ${secret ?? ''}`);
  if (!secret || provided.length !== expected.length || !timingSafeEqual(provided, expected)) return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const headers = { 'Cache-Control': 'no-store' }, on = whenSendingOn();
  // Without the site's address every link in a message would lead nowhere, the stop link included.
  if (on && !(process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://')) return Response.json({ on, error: 'NEXT_PUBLIC_APP_URL is not set' }, { status: 503, headers });
  try {
    return Response.json({ on, ...await drainWhen(db(), { address: personId => clerkEmailOf(db(), personId), email: on ? resendSender() : null }) }, { headers });
  } catch {
    return Response.json({ on, error: 'Sending unavailable' }, { status: 503, headers });
  }
}
