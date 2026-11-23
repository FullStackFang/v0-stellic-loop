import type { Q } from '../db';
import { isAdmin } from './admin';

// Loopd Ink, the paid plan (openspec/changes/loop-ink-placements). This file is read by the browser too (the bar links
// to INK_PAGE), so it imports nothing that is for the server only.

/** Where every placement leads: the Ink page of the app (app/c/ink), which has the app's own top bar. */
export const INK_PAGE = '/c/ink';
/** What that page shows under the bar. The approved mockup, until there is a real page: then this one line changes. */
export const INK_MOCKUP = '/demo/mockups-premium.html';

/**
 * A person's plan (openspec loop-ink-tiers): Loopd (free), Ink ($2.99) or Ink+ ($9.99), and Ink+ holds everything in Ink.
 * There is no payment yet, so a plan means they asked to subscribe: Ink is a row in campus_custom_face, Ink+ a row in
 * campus_ink_plus. The day payment exists, these readers change and nothing else.
 */
export type Plan = 'free' | 'ink' | 'plus';
/** How many animals Ink draws from pet photos, in all. Ink+ has no limit. */
export const INK_MAKES = 3;
/** Each person's plan, for many at once. Anyone not asked for is left out of the map: read a missing one as free. */
export async function plansOf(q: Q, personIds: readonly string[]): Promise<Map<string, Plan>> {
  if (!personIds.length) return new Map();
  const { rows } = await q.query<{ id: string; plan: Plan }>(`select i.id,case when exists(select 1 from campus_ink_plus p where p.person_id=i.id) then 'plus'
    when exists(select 1 from campus_custom_face f where f.person_id=i.id) then 'ink' else 'free' end as plan from unnest($1::uuid[]) as i(id)`, [personIds]);
  return new Map(rows.map(row => [row.id, row.plan]));
}
export const planOf = async (q: Q, personId: string): Promise<Plan> => (await plansOf(q, [personId])).get(personId) ?? 'free';
/** Whether a person has Ink: on Ink, or on Ink+, which holds it. */
export const hasInk = async (q: Q, personId: string) => (await planOf(q, personId)) !== 'free';

/** Where in the app a person can press Subscribe. */
export type AskPlace = 'own animal' | 'group picture' | 'save picture' | 'assistants' | 'footer' | JoinPlace;
/** Keeps one press of Subscribe: who, the email they gave, the plan and where they pressed it. Every press is kept, a second one too. */
export const recordAsk = (q: Q, personId: string, email: string, plan: 'ink' | 'ink_plus', place: AskPlace) =>
  q.query('insert into campus_subscribe_ask(person_id,email,plan,place) values($1,$2,$3,$4)', [personId, email, plan, place]);
export type SubscribeAsk = { email: string; plan: 'ink' | 'ink_plus'; place: string; asked: string };
/** For the admin: every press of Subscribe, newest first. */
export const subscribeAsks = async (q: Q) => (await q.query<SubscribeAsk>(`select email,plan,place,to_char(asked_at,'YYYY-MM-DD HH24:MI') as asked from campus_subscribe_ask order by asked_at desc,id desc limit 500`)).rows;

/** Whether a person has Ink+. As with Ink, it means they asked to subscribe: nothing is charged. Ink+ holds Ink, so hasInk is true for them too. */
export const hasInkPlus = async (q: Q, personId: string) => (await q.query('select 1 from campus_ink_plus where person_id=$1', [personId])).rows.length > 0;
/** Whether a person may connect an assistant to their groups: that is part of Ink+. The admin always may. */
export const hasAssistants = async (q: Q, who: { personId: string; subject: string; verifiedEmail: string | null }) => isAdmin(who) || await hasInkPlus(q, who.personId);
/**
 * Signs a person up for a plan: they have it at once, since nothing is charged yet, and the press is recorded with the
 * email they gave and where it was made. Signing up twice changes what they have not at all, and is recorded again.
 * Returns false for an email that is not one. Every sign-up in the app comes here (openspec loop-ink-tiers).
 */
export async function joinPlan(q: Q, personId: string, email: string, plan: 'ink' | 'plus', place: AskPlace): Promise<boolean> {
  const given = email.trim().toLowerCase().slice(0, 320);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(given)) return false;
  await q.query(`insert into ${plan === 'plus' ? 'campus_ink_plus' : 'campus_custom_face'}(person_id,email) values($1,$2) on conflict(person_id) do nothing`, [personId, given]);
  await recordAsk(q, personId, given, plan === 'plus' ? 'ink_plus' : 'ink', place);
  return true;
}
/** "Subscribe" to Ink+: joinPlan for Ink+. */
export const subscribeInkPlus = (q: Q, personId: string, email: string, place: AskPlace = 'group picture') => joinPlan(q, personId, email, 'plus', place);
/**
 * The sign-ups a person can press outside the asks that take an email of their own: each names the feature, then the
 * button. They come in from the browser (app/c/ink/join), so only these are kept.
 */
export const JOIN_PLACES = ['ink page: Get Ink', 'ink page: Get Ink+', 'ink page: Move to Ink+', 'colours: Sign up', 'colours: Get Ink', 'account: Get Ink', 'account: Get Ink+', 'pets: Get Ink', 'pets: Get Ink+', 'pets: Start from another pet', 'pets: Redraw your pet', 'assistants: Get Ink+', 'group picture: Get Ink+', 'save picture: Get Ink+', 'seats: Get Ink', 'conga: Get Ink', 'conga: Get Ink+', 'conga: Every ground'] as const;
export type JoinPlace = (typeof JOIN_PLACES)[number];
/** What every sign-up says once it is done. */
/** The thanks after signing up. With the email it was kept under, it says so, so the person knows it was received. */
export const joinedWords = (plan: 'ink' | 'plus', email?: string) => `Thanks for your interest. This isn’t ready yet, so we’ve upgraded you to ${plan === 'plus' ? 'Ink+' : 'Ink'} for now.${email ? ` We’ll write to ${email.trim().toLowerCase()} when it is.` : ''}`;

/**
 * Signing up on the Ink page without an account: the email given, the plan and the button are kept, and nothing else
 * (there is nobody yet to give the plan to). Returns false for an email that is not one.
 */
export async function joinSignedOut(q: Q, email: unknown, plan: 'ink' | 'plus', place: JoinPlace): Promise<boolean> {
  const given = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 320) : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(given)) return false;
  await q.query('insert into campus_ink_waitlist(email,plan,place) values($1,$2,$3)', [given, plan === 'plus' ? 'ink_plus' : 'ink', place]);
  return true;
}
/**
 * Once someone signs in with an email that signed up while signed out, they are given the plan it asked for, the
 * highest if it asked for more than one, and the sign-up is recorded as theirs. Each is given once. Before the
 * migration that makes the list, there is nothing to give.
 */
/** For the admin: every sign-up made signed out, newest first, and whether that email has signed in since. Empty before its migration. */
export const signedOutAsks = async (q: Q) => (await q.query<{ email: string; plan: 'ink' | 'ink_plus'; place: string; asked: string; claimed: boolean }>(`select email,plan,place,to_char(asked_at,'YYYY-MM-DD HH24:MI') as asked,claimed_at is not null as claimed from campus_ink_waitlist order by asked_at desc,id desc limit 500`)).rows;
export async function claimSignedOut(q: Q, personId: string, email: string | null): Promise<void> {
  if (!email) return;
  const { rows } = await q.query<{ plan: 'ink' | 'ink_plus'; place: string }>(`update campus_ink_waitlist set claimed_at=now(),person_id=$2 where lower(email)=lower($1) and claimed_at is null returning plan,place`, [email, personId])
    .catch(() => ({ rows: [] as { plan: 'ink' | 'ink_plus'; place: string }[] }));
  const plus = rows.some(row => row.plan === 'ink_plus'), place = rows.find(row => (row.plan === 'ink_plus') === plus)?.place;
  if (place) await joinPlan(q, personId, email, plus ? 'plus' : 'ink', `${place} (signed out)` as AskPlace);
}
