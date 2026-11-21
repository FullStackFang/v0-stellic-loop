import { db } from '@/lib/db';
import { askForCall } from '@/lib/campus/call-ask';
import { campusViewer } from '@/lib/campus/session';

// "15 minutes?" on the Ink page, after signing up (public/demo/mockups-ink-join.html): a student or an organizer sends
// when a short Zoom call would suit them. Takes `{ role, times, note }`; the founder writes back. Nothing is booked.

const said = (status: number, body: object) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });

export async function POST(request: Request) {
  // Only from Loopd's own pages, as with signing up (app/c/ink/join).
  const origin = request.headers.get('origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) return said(403, { ok: false });
  // Signed in, it is their account's email; signed out (after signing up on the Ink page), the email they gave.
  const viewer = await campusViewer();
  const body = await request.json().catch(() => null) as { role?: unknown; times?: unknown; note?: unknown; email?: unknown } | null;
  const email = viewer ? viewer.principal.verifiedEmail ?? '' : typeof body?.email === 'string' ? body.email : '';
  if (!viewer && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return said(401, { ok: false });
  if (!body || !await askForCall(db(), viewer?.personId ?? null, email, body)) return said(400, { ok: false });
  return said(200, { ok: true, email });
}
