import { db } from '@/lib/db';
import { recordClubAsk } from '@/lib/campus/imprint';
import { campusViewer } from '@/lib/campus/session';

// Keeps one press of "Claim your club" from the organizers page (lib/campus/imprint.ts). Open to signed-out visitors:
// who pressed is added when they are signed in, and is never taken from what the page sends.

const say = (status: number, words: string) => Response.json({ ok: status === 200, message: words }, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(request: Request) {
  // Only the page itself may post here: a form on another site is turned away.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return say(403, 'Send this from the organizers page.');
  const sent: unknown = await request.json().catch(() => null);
  if (!sent || typeof sent !== 'object') return say(400, 'Give your club and your email.');
  const { club, email, plan } = sent as Record<string, unknown>, viewer = await campusViewer();
  const kept = await recordClubAsk(db(), { personId: viewer?.personId ?? null, club, email, plan, place: 'organizers page' });
  return kept ? say(200, 'On the list.') : say(400, 'Give your club and an email we can write to.');
}
