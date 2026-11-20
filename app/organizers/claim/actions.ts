'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { askClubReview, claimClub, type Claimant } from '@/lib/campus/club-claim';
import { campusViewer, signInHref } from '@/lib/campus/session';

// The two presses of the claim page (./page.tsx). Each finds who is asking afresh, and ends back on the page with what happened.

const PAGE = '/organizers/claim';
/** Who is asking, and whether the email they signed in with is one of their school's. Signed out, they are sent to sign in. */
async function claimant(): Promise<Claimant> {
  const viewer = await campusViewer();
  if (!viewer) redirect(signInHref(PAGE));
  const email = viewer.principal.verifiedEmail?.trim().toLowerCase() ?? null, domain = email?.split('@')[1] ?? '';
  return { personId: viewer.personId, email, schoolEmail: !!viewer.campus && viewer.campus.domains.some(each => domain === each.toLowerCase() || domain.endsWith(`.${each.toLowerCase()}`)) };
}
const back = (said: string, link = '', club = '') => redirect(`${PAGE}?said=${said}${link ? `&link=${encodeURIComponent(link)}` : ''}${club ? `&club=${encodeURIComponent(club)}` : ''}`);

/** "Check": reads the club's officer list. With their name on it, the club is theirs. */
export async function claimClubAction(data: FormData): Promise<void> {
  const who = await claimant(), result = await claimClub(db(), who, String(data.get('link') ?? ''));
  if (result.state === 'bad link') back('bad');
  else if (result.state === 'unreadable') back('unreadable', result.page);
  else back(result.state, result.page, result.club);
}
/** "Send for review": the claim waits for a person at Loopd. */
export async function askClubReviewAction(data: FormData): Promise<void> {
  const who = await claimant(), link = String(data.get('link') ?? '');
  back(await askClubReview(db(), who, link, String(data.get('note') ?? '')) ? 'sent' : 'unreadable', link);
}
