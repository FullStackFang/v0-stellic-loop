// What the admin's Activity and People sections show (app/c/admin/stats.tsx). Accounts and sign-ins are read from the
// sign-in provider, which has them for everyone. Page opens are counted here, in site_open, from the day that table
// exists. What people did (plans, check-ins...) is counted from the rows those things already leave.
import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import type { Q } from '../db';
import { clerkIssuer, clerkPortalConfigured } from '../emba/clerk-identity';
import { animal, animalOf, CUSTOM, customFace, PHOTO } from './animals';

const DAY = 86_400_000;

/**
 * The part of the site a page belongs to, by its path. Null for a page that is not counted: the admin's own pages.
 * Only this name is kept, never the path, since some paths carry a share token.
 */
export function areaOf(path: string): string | null {
  const under = (base: string) => path === base || path.startsWith(`${base}/`);
  if (path === '/') return 'Front door';
  if (under('/c/admin') || under('/emba')) return null;
  if (under('/sign-in') || under('/groups/sign-in')) return 'Sign in';
  if (under('/c/ink')) return 'Ink';
  if (under('/conga')) return 'Conga';
  if (under('/c/doodles/seats')) return 'Seats';
  if (under('/c/doodles')) return 'Doodles';
  if (under('/organizers')) return 'Organizers';
  if (/^\/c\/[^/]+\/post$/.test(path)) return 'Post a plan';
  if (/^\/c\/[^/]+$/.test(path)) return 'This week';
  if (under('/o')) return 'Shared plan';
  if (under('/groups/connections')) return 'Assistants';
  if (under('/groups')) return 'Groups';
  if (under('/privacy') || under('/terms')) return 'Terms and privacy';
  return 'Other';
}

/** Counts one page opened. `subject` is the signed-in account, if any; an account Loopd has no person for counts as a visitor. Returns whether it was counted. */
export async function recordOpen(q: Q, path: string, issuer: string | null, subject: string | null): Promise<boolean> {
  const area = areaOf(path);
  if (!area) return false;
  await q.query(`insert into site_open(person_id,area) values((select person_id from emba_identity where issuer=$1 and subject=$2 and revoked_at is null),$3)`, [issuer, subject, area]);
  return true;
}

/** The last `count` days in a timezone, oldest first, as 'YYYY-MM-DD'. */
export function lastDays(today: string, count: number): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, at) => new Date(end - (count - 1 - at) * DAY).toISOString().slice(0, 10));
}

export type Opens = { total: number; people: number; areas: { area: string; opens: number }[]; days: Map<string, { people: number; opens: number }>; since: string | null };
const NO_OPENS: Opens = { total: 0, people: 0, areas: [], days: new Map(), since: null };
/**
 * Pages opened since `since` (null: ever): how many, by how many signed-in people, by part of the site, and by day in
 * `tz`. `since` in the answer is the day counting began. With the table not there yet, nothing was opened.
 */
export async function siteOpens(q: Q, since: Date | null, tz: string): Promise<Opens> {
  try {
    const from = since?.toISOString() ?? null;
    const [areas, days, all] = await Promise.all([
      q.query<{ area: string; opens: number }>(`select area,count(*)::int as opens from site_open where $1::timestamptz is null or opened_at>=$1 group by area order by opens desc,area`, [from]),
      q.query<{ day: string; people: number; opens: number }>(`select to_char((opened_at at time zone $2)::date,'YYYY-MM-DD') as day,count(distinct person_id)::int as people,count(*)::int as opens from site_open where $1::timestamptz is null or opened_at>=$1 group by 1`, [from, tz]),
      q.query<{ people: number; since: string | null }>(`select (select count(distinct person_id)::int from site_open where $1::timestamptz is null or opened_at>=$1) as people,(select to_char((min(opened_at) at time zone $2)::date,'YYYY-MM-DD') from site_open) as since`, [from, tz]),
    ]);
    return { total: areas.rows.reduce((sum, row) => sum + row.opens, 0), people: all.rows[0].people, areas: areas.rows, days: new Map(days.rows.map(row => [row.day, { people: row.people, opens: row.opens }])), since: all.rows[0].since };
  } catch (error) {
    if ((error as { code?: string }).code !== '42P01' && !/site_open/.test(String((error as Error)?.message))) throw error;
    return NO_OPENS;
  }
}

/** What people did since `since` (null: ever), the most done first. Each is counted from the rows it already leaves, so it reaches back to the start. */
export async function siteActions(q: Q, since: Date | null): Promise<{ name: string; times: number }[]> {
  const within = (column: string) => `($1::timestamptz is null or ${column}>=$1)`;
  const { rows: [row] } = await q.query<Record<string, number>>(`select
    (select count(*)::int from campus_outing_member where ${within('joined_at')}) as "Said they are in",
    (select count(*)::int from campus_outing_member where checked_in_at is not null and ${within('checked_in_at')}) as "Checked in",
    (select count(*)::int from campus_listing where origin='member' and ${within('created_at')}) as "Posted a plan",
    (select count(*)::int from campus_custom_picture where ${within('made_at')}) as "Had an animal drawn",
    (select count(*)::int from campus_subscribe_ask where ${within('asked_at')}) as "Pressed Subscribe",
    (select count(*)::int from campus_reward_use where ${within('used_at')}) as "Used a reward",
    (select count(*)::int from campus_school_ask where ${within('asked_at')}) as "Asked for their school"`, [since?.toISOString() ?? null]);
  return Object.entries(row).map(([name, times]) => ({ name, times })).sort((a, b) => b.times - a.times);
}

export const WAYS = { google: 'Google', email: 'Email', linkedin: 'LinkedIn', other: 'Other' } as const;
export type Way = keyof typeof WAYS;
/** What the sign-in provider holds of one account. Times are milliseconds. */
export type Account = { subject: string; name: string; email: string | null; photo: string; ways: Way[]; joined: number; lastSignIn: number | null; lastActive: number | null };
type ClerkUser = { id: string; firstName: string | null; lastName: string | null; imageUrl: string; passwordEnabled: boolean; createdAt: number; lastSignInAt: number | null; lastActiveAt: number | null; primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string; verification: { strategy: string } | null }[]; externalAccounts: { provider: string }[] };

/**
 * The ways an account can sign in: each outside account joined to it (Google, LinkedIn), and Email when it has a
 * password or an address it proved by a code or link sent to it. An account with nothing else signs in by email.
 */
export function waysOf(user: Pick<ClerkUser, 'externalAccounts' | 'emailAddresses' | 'passwordEnabled'>): Way[] {
  const ways = new Set<Way>();
  for (const { provider } of user.externalAccounts) ways.add(provider.includes('google') ? 'google' : provider.includes('linkedin') ? 'linkedin' : 'other');
  if (user.passwordEnabled || user.emailAddresses.some(each => /^email_/.test(each.verification?.strategy ?? '')) || !ways.size) ways.add('email');
  return (Object.keys(WAYS) as Way[]).filter(way => ways.has(way));
}
export function accountOf(user: ClerkUser): Account {
  const email = user.emailAddresses.find(each => each.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
  return { subject: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim(), email: email?.emailAddress.trim().toLowerCase() ?? null, photo: user.imageUrl, ways: waysOf(user), joined: user.createdAt, lastSignIn: user.lastSignInAt, lastActive: user.lastActiveAt };
}
/** Every account, the most recently signed in first. Empty when sign-in is not set up. */
export async function accounts(): Promise<Account[]> {
  if (!clerkPortalConfigured()) return [];
  const client = await clerkClient(), found: Account[] = [], PAGE = 500;
  for (let offset = 0; offset < 50 * PAGE; offset += PAGE) {
    const { data } = await client.users.getUserList({ limit: PAGE, offset, orderBy: '-last_sign_in_at' });
    found.push(...data.map(accountOf));
    if (data.length < PAGE) break;
  }
  return found.sort((a, b) => (b.lastSignIn ?? 0) - (a.lastSignIn ?? 0) || b.joined - a.joined);
}

/** The numbers over a list of accounts: how many, how many joined and were active since `since` (null: ever), and how many can sign in each way. */
export function summarise(all: readonly Account[], since: Date | null) {
  const from = since?.getTime() ?? 0;
  const ways = (Object.keys(WAYS) as Way[]).map(way => ({ way, people: all.filter(each => each.ways.includes(way)).length })).filter(each => each.people);
  return { people: all.length, joined: all.filter(each => each.joined >= from).length, active: all.filter(each => (each.lastActive ?? each.lastSignIn ?? 0) >= Math.max(from, 1)).length, ways };
}

export type PersonFacts = { school: string | null; face: string | null; ink: boolean; inkPlus: boolean; days: string[] };
/**
 * What Loopd itself knows of each account, by its subject: the campus they are at, the picture they wear (null: the
 * photo of their sign-in account), their plan, and the days since `since` on which they opened a page, in `tz`.
 * An account Loopd has no person for is left out.
 */
export async function personFacts(q: Q, subjects: readonly string[], tz: string, since: Date): Promise<Map<string, PersonFacts>> {
  const issuer = clerkIssuer();
  if (!issuer || !subjects.length) return new Map();
  const { rows } = await q.query<{ subject: string; id: string; school: string | null; face: number | null; token: string | null; ink: boolean; inkPlus: boolean }>(`select i.subject,i.person_id as id,c.name as school,f.face,
    (select p.token::text from campus_custom_picture p where p.token=coalesce(f.picture,x.token)) as token,x.person_id is not null as ink,
    exists(select 1 from campus_ink_plus k where k.person_id=i.person_id) as "inkPlus"
    from emba_identity i left join campus_person m on m.person_id=i.person_id left join campus c on c.id=m.campus_id
    left join campus_face f on f.person_id=i.person_id left join campus_custom_face x on x.person_id=i.person_id
    where i.issuer=$1 and i.subject=any($2::text[]) and i.revoked_at is null`, [issuer, subjects]);
  const days = new Map<string, string[]>();
  try {
    const seen = await q.query<{ id: string; days: string[] }>(`select person_id as id,array_agg(distinct to_char((opened_at at time zone $2)::date,'YYYY-MM-DD')) as days from site_open where person_id=any($1::uuid[]) and opened_at>=$3 group by person_id`, [rows.map(row => row.id), tz, since.toISOString()]);
    for (const row of seen.rows) days.set(row.id, row.days);
  } catch (error) {
    if ((error as { code?: string }).code !== '42P01' && !/site_open/.test(String((error as Error)?.message))) throw error;
  }
  return new Map(rows.map(row => [row.subject, { school: row.school, ink: row.ink, inkPlus: row.inkPlus, days: days.get(row.id) ?? [],
    face: row.face === PHOTO ? null : row.face === CUSTOM && row.token ? customFace(row.token) : animal(row.face == null || row.face < 0 ? animalOf(row.id) : row.face) }]));
}
