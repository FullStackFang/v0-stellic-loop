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

/** Whether a person has Ink+. As with Ink, it means they asked to subscribe: nothing is charged. Asking for Ink+ does not by itself give Ink. */
export const hasInkPlus = async (q: Q, personId: string) => (await q.query('select 1 from campus_ink_plus where person_id=$1', [personId])).rows.length > 0;
/** "Subscribe" to Ink+: that they asked, and the email they gave, is kept. Asking twice changes nothing. Returns false for an email that is not one. */
export async function subscribeInkPlus(q: Q, personId: string, email: string): Promise<boolean> {
  const given = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(given)) return false;
  await q.query('insert into campus_ink_plus(person_id,email) values($1,$2) on conflict(person_id) do nothing', [personId, given.slice(0, 320)]);
  return true;
}
