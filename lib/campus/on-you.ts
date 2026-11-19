import 'server-only';
import { db } from '../db';
import type { Principal } from '../emba/access';
import { groupPath, ROOT_SLUG } from '../emba/group-path';
import { onYou, type OnYouRow } from '../emba/team-waiting';

// "On you" on the campus screen (openspec loop-on-you): what the person's groups need from them, shaped for drawing. One row
// is one thing with one way to act on it. Nothing here is about anyone but the person looking.

type Scope = { orgId: string; loopId: string };
export type OnYouItem = { id: string; k: 'vote' | 'do' | 'show' | 'missed'; what: string; group: string; when: string; soon: boolean; scope: Scope;
  /** A word on why it waits, where the row has no button that says it. */
  note?: string;
  act: { type: 'done'; number: number } | { type: 'pick'; number: number; options: { number: number; label: string }[] } | { type: 'open'; href: string; label: string } | { type: 'go'; event: string } | null };
export type OnYouClaim = { id: string; scope: Scope; number: number; what: string; group: string; by: string; due: string | null };
export type OnYouGroup = { tag: string; name: string; scope: Scope; timezone: string };
export type OnYouView = { count: number; items: OnYouItem[]; /** How many more wait than are listed. */ more: number; claims: OnYouClaim[]; /** The groups the person may ask. */ groups: OnYouGroup[];
  /** Every group the person is in, each with its page. */ mine: { name: string; href: string }[] };
/** "@club" is at /groups/club; "@club/vietnam" is the group inside it. */
const hrefOf = (handle: string) => { const [namespace, slug] = handle.slice(1).split('/'); return groupPath(namespace, slug ?? ROOT_SLUG); };

/** Buttons for a pick-one ask with a few short options; anything longer opens on the ask's own page. */
const FEW = 4, SHORT = 60;
const short = (when: string | null) => (when ?? '').replace(/ 20\d\d,/, ',');
const SOON = 48 * 3_600_000;
const whyWords = { one_short: 'One more and it is on', needs_place: 'It has the people. It needs a place', needs_time: 'It has a day. It needs a time', choose_day: 'The vote for its day ended without a clear answer' } as const;

function item(row: OnYouRow, now: number): OnYouItem {
  const base = { group: row.team.name, scope: row.scope };
  if (row.kind === 'event' || row.kind === 'idea') {
    const { event } = row, starts = event.startsAt ? Date.parse(event.startsAt) : null, waitsOnThem = row.kind === 'event' || row.why === 'one_short';
    return { ...base, id: `${row.scope.loopId}:e:${event.slug}`, k: 'show', what: event.name, when: event.starts ? short(event.starts) : 'No date yet', soon: starts !== null && starts - now < SOON,
      ...(row.kind === 'idea' ? { note: whyWords[row.why] } : {}), act: waitsOnThem ? { type: 'go', event: event.slug } : null };
  }
  const { ask } = row, todo = ask.kind === 'done', id = `${row.scope.loopId}:a:${ask.number}`;
  if (row.kind === 'missed') return { ...base, id, k: 'missed', what: ask.question, when: `Passed ${short(ask.closes)}`, soon: false, act: null };
  const few = ask.kind === 'one' && ask.options.length <= FEW && ask.options.reduce((sum, option) => sum + option.label.length, 0) <= SHORT;
  return { ...base, id, k: todo ? 'do' : 'vote', what: ask.question, when: `${todo ? 'Due' : 'Closes'} ${short(ask.closes)}`, soon: ask.closingSoon,
    act: todo ? { type: 'done', number: ask.number } : few ? { type: 'pick', number: ask.number, options: ask.options.map(({ number, label }) => ({ number, label })) }
      : { type: 'open', href: new URL(ask.shareUrl).pathname, label: ask.kind === 'text' ? 'Write an answer' : ask.kind === 'dates' ? 'Pick dates' : 'Choose' } };
}

/** Everything on this person across their groups. Null when they are in no group. */
export async function onYouView(principal: Principal, now = Date.now()): Promise<OnYouView | null> {
  const read = await onYou(db(), principal);
  if (!read.groups.length) return null;
  return { count: read.count, items: read.rows.map(row => item(row, now)), more: read.more.reduce((sum, rest) => sum + rest.count, 0), mine: read.groups.map(group => ({ name: group.team.name, href: hrefOf(group.team.handle) })),
    claims: read.claims.map(({ team, scope, record }) => ({ id: `${scope.loopId}:c:${record.number}`, scope, number: record.number, what: record.what ?? '', group: team.name, by: record.by.handle ?? 'A teammate', due: record.dueOn ?? null })),
    // "@club" is the tag "club"; "@club/vietnam" is "club-vietnam": a tag has no slash.
    groups: read.groups.filter(group => group.posts).map(group => ({ tag: group.team.handle.slice(1).replace('/', '-'), name: group.team.name, scope: group.scope, timezone: group.timezone })) };
}
