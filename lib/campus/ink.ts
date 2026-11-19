import type { Q } from '../db';

// Loop Ink, the paid plan (openspec/changes/loop-ink-placements). This file is read by the browser too (the bar links
// to INK_PAGE), so it imports nothing that is for the server only.

/** Where every placement leads: the Ink page of the app (app/c/ink), which has the app's own top bar. */
export const INK_PAGE = '/c/ink';
/** What that page shows under the bar. The approved mockup, until there is a real page: then this one line changes. */
export const INK_MOCKUP = '/demo/mockups-premium.html';

/**
 * Whether a person has Ink. There is no payment yet, so it means they asked to subscribe. The campus screen reads the
 * same fact for many people at once as `asked` in customFaces (lib/campus/custom-face.ts): the day payment exists, both change.
 */
export const hasInk = async (q: Q, personId: string) => (await q.query('select 1 from campus_custom_face where person_id=$1', [personId])).rows.length > 0;

/** Where in the app a person can press Subscribe. */
export type AskPlace = 'own animal' | 'group picture' | 'save picture';
/** Keeps one press of Subscribe: who, the email they gave, the plan and where they pressed it. Every press is kept, a second one too. */
export const recordAsk = (q: Q, personId: string, email: string, plan: 'ink' | 'ink_plus', place: AskPlace) =>
  q.query('insert into campus_subscribe_ask(person_id,email,plan,place) values($1,$2,$3,$4)', [personId, email, plan, place]);
export type SubscribeAsk = { email: string; plan: 'ink' | 'ink_plus'; place: string; asked: string };
/** For the admin: every press of Subscribe, newest first. */
export const subscribeAsks = async (q: Q) => (await q.query<SubscribeAsk>(`select email,plan,place,to_char(asked_at,'YYYY-MM-DD HH24:MI') as asked from campus_subscribe_ask order by asked_at desc,id desc limit 500`)).rows;

/** Whether a person has Ink+. As with Ink, it means they asked to subscribe: nothing is charged. Asking for Ink+ does not by itself give Ink. */
export const hasInkPlus = async (q: Q, personId: string) => (await q.query('select 1 from campus_ink_plus where person_id=$1', [personId])).rows.length > 0;
/** "Subscribe" to Ink+: that they asked, and the email they gave, is kept, and the press is recorded with where it was made. Asking twice changes what they have not at all. Returns false for an email that is not one. */
export async function subscribeInkPlus(q: Q, personId: string, email: string, place: AskPlace = 'group picture'): Promise<boolean> {
  const given = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(given)) return false;
  await q.query('insert into campus_ink_plus(person_id,email) values($1,$2) on conflict(person_id) do nothing', [personId, given.slice(0, 320)]);
  await recordAsk(q, personId, given.slice(0, 320), 'ink_plus', place);
  return true;
}
