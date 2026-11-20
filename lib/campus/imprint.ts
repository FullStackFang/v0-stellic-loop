import type { Q } from '../db';

// The organizers' door (public/demo/mockups-imprint.html, mockups-organizer-flow.html). Claiming a club and Imprint, the
// club's paid plan, are a field test: the page takes a club and an email, keeps them, and says we are not ready yet.
// Nothing is charged. This file is read by the browser too (the bar links to IMPRINT_PAGE), so it imports nothing that
// is for the server only.

/** Where "Claim your club" leads: the organizers page (app/organizers), which has the app's own top bar. */
export const IMPRINT_PAGE = '/organizers';
/** What that page shows under the bar. The approved mockup, until there is a real page: then this one line changes. */
export const IMPRINT_MOCKUP = '/demo/mockups-imprint.html';

export type ClubPlan = 'free' | 'imprint';
export type ClubAsk = { club: string; email: string; plan: ClubPlan; place: string; asked: string };

/**
 * Keeps one press of "Claim your club": the club, the email given, the plan wanted, where it was pressed, and who
 * pressed it when they were signed in. Every press is kept, a second one too. Returns false, and keeps nothing, for a
 * club with no name, an email that is not one, or a plan there is not.
 */
export async function recordClubAsk(q: Q, ask: { personId: string | null; club: unknown; email: unknown; plan: unknown; place: string }): Promise<boolean> {
  const club = typeof ask.club === 'string' ? ask.club.replace(/\s+/g, ' ').trim() : '', email = typeof ask.email === 'string' ? ask.email.trim().toLowerCase() : '';
  if (!club || club.length > 120 || email.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || (ask.plan !== 'free' && ask.plan !== 'imprint')) return false;
  await q.query('insert into campus_club_ask(person_id,club,email,plan,place) values($1,$2,$3,$4,$5)', [ask.personId, club, email, ask.plan, ask.place.slice(0, 40)]);
  return true;
}
/** For the admin: every claim, newest first. */
export const clubAsks = async (q: Q) => (await q.query<ClubAsk>(`select club,email,plan,place,to_char(asked_at,'YYYY-MM-DD HH24:MI') as asked from campus_club_ask order by asked_at desc,id desc limit 500`)).rows;
