import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { claimSignedOut, JOIN_PLACES, joinPlan, joinSignedOut, joinedWords, planOf, type JoinPlace } from '@/lib/campus/ink';
import { campusViewer, signInHref } from '@/lib/campus/session';
import { listCampuses } from '@/lib/campus/listings';
import { schoolOf } from '@/lib/campus/schools';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';

// Signing up for Ink or Ink+ from an ask that takes no email of its own (openspec loop-ink-tiers): the Ink page's plan
// cards, the colours card, the account row, the pet maker, and the games. A route and not a server action, so the plain
// pages (Conga, and the Ink page's mockup in its frame) sign up the same way as the app. Takes `{ plan, place, back }`.
// The person is given the plan with their account's email, and the press is recorded with the place.

const no = (status: number, said: object) => Response.json(said, { status, headers: { 'cache-control': 'private, no-store' } });

/**
 * Who is looking, for the Ink page's tickets (public/demo/mockups-ink-join.html): signed in or not, their plan (that
 * ticket is punched, the ones under it are included), and the email the plan's news goes to. Someone who signed up
 * here while signed out, and has now signed in with that email, is given the plan first.
 */
export async function GET() {
  const viewer = await campusViewer();
  if (viewer) await claimSignedOut(db(), viewer.personId, viewer.principal.verifiedEmail);
  const said = viewer ? { signedIn: true, plan: await planOf(db(), viewer.personId), email: viewer.principal.verifiedEmail ?? '' } : { signedIn: false, plan: 'free' as const, email: '' };
  return Response.json(said, { headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(request: Request) {
  // Only from Loopd's own pages: a sign-up is a change to someone's account.
  const origin = request.headers.get('origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) return no(403, { ok: false });
  const body = await request.json().catch(() => null) as { plan?: unknown; place?: unknown; back?: unknown; email?: unknown } | null;
  const plan = body?.plan === 'plus' ? 'plus' : body?.plan === 'ink' ? 'ink' : null, place = JOIN_PLACES.find(each => each === body?.place) as JoinPlace | undefined;
  if (!plan || !place) return no(400, { ok: false });
  const viewer = await campusViewer();
  const back = typeof body?.back === 'string' && body.back.startsWith('/') && !body.back.startsWith('//') ? body.back : '/c/ink';
  // On the Ink page, someone signed out signs up with an email: it is kept, and the plan is theirs once they sign in with it.
  if (!viewer && place.startsWith('ink page:') && body?.email !== undefined) {
    if (!await joinSignedOut(db(), body.email, plan, place)) return no(400, { ok: false, message: 'Enter the email to sign up with.' });
    return Response.json({ ok: true, signedOut: true }, { headers: { 'cache-control': 'private, no-store' } });
  }
  // Signed out: what the sign-in card needs to open where the button was (components/campus/join-plan.tsx), so nobody leaves the page to sign up.
  if (!viewer) {
    const schools = (await listCampuses(db())).filter(campus => schoolOf(campus.slug) === campus.slug).map(({ slug, name, domains }) => ({ slug, name, domains }));
    return no(401, { ok: false, signIn: signInHref(back), schools, configured: clerkPortalConfigured() });
  }
  if (!await joinPlan(db(), viewer.personId, viewer.principal.verifiedEmail ?? '', plan, place)) return no(400, { ok: false, message: 'Your account has no email to sign up with.' });
  revalidatePath('/c', 'layout'); revalidatePath('/groups', 'layout');
  return Response.json({ ok: true, said: joinedWords(plan, viewer.principal.verifiedEmail ?? undefined) }, { headers: { 'cache-control': 'private, no-store' } });
}
