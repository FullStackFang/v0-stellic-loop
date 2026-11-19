import 'server-only';
import { db } from '../db';
import type { Principal } from '../emba/access';
import { groupPath, ROOT_SLUG } from '../emba/group-path';
import { groupPictureMap } from '../emba/group-picture';
import { groupPictureSrc } from '../emba/group-picture-src';
import { onYou, type OnYouRow } from '../emba/team-waiting';
import { animal, animalOf } from './animals';
import { pickedFaces } from './people';

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
  /** Every group the person is in, a group inside another after its parent. */ mine: OnYouMine[] };
/** One of the person's groups: its page, who is in it, the next thing in it that waits on them, and how many do. */
export type OnYouMine = { id: string; name: string; handle: string; href: string; /** The group this one is inside, by name. */ inside: string | null; people: number; faces: string[]; /** The group's drawn picture, when it has one: shown in place of the faces. */ picture: string | null; next: string | null; on: number };
/** "@club" is at /groups/club; "@club/vietnam" is the group inside it. */
const hrefOf = (handle: string) => { const [namespace, slug] = handle.slice(1).split('/'); return `${groupPath(namespace, slug ?? ROOT_SLUG)}/team`; };

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

/** How many people each group has, and the faces of a few of them. A picked photo is drawn as the person's animal here. */
const SHOWN = 4;
async function membersOf(loopIds: string[]): Promise<Map<string, { people: number; faces: string[] }>> {
  const { rows } = await db().query<{ id: string; people: number; some: string[] }>(`select r.loop_id as id, count(*)::int as people, (array_agg(r.person_id::text order by r.person_id))[1:${SHOWN}] as some
    from emba_role r join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id
    where r.loop_id=any($1::uuid[]) and r.revoked_at is null and m.revoked_at is null group by r.loop_id`, [loopIds]);
  const picks = await pickedFaces(db(), rows.flatMap(row => row.some));
  return new Map(rows.map(row => [row.id, { people: row.people, faces: row.some.map(id => { const pick = picks.get(id); return animal(pick === undefined || pick < 0 ? animalOf(id) : pick); }) }]));
}

/** Everything on this person across their groups. Null when they are in no group. */
export async function onYouView(principal: Principal, now = Date.now()): Promise<OnYouView | null> {
  const read = await onYou(db(), principal);
  if (!read.groups.length) return null;
  const members = await membersOf(read.groups.map(group => group.scope.loopId)).catch(() => new Map<string, { people: number; faces: string[] }>());
  const pictures = await groupPictureMap(db(), read.groups.map(group => group.scope.loopId));
  const waits = (loopId: string) => [...read.claims.filter(claim => claim.scope.loopId === loopId).map(claim => claim.record.what ?? ''), ...read.rows.filter(row => row.scope.loopId === loopId && row.kind !== 'missed').map(row => 'ask' in row ? row.ask.question : row.event.name)];
  const byHandle = [...read.groups].sort((a, b) => a.team.handle.localeCompare(b.team.handle));
  return { count: read.count, items: read.rows.map(row => item(row, now)), more: read.more.reduce((sum, rest) => sum + rest.count, 0), 
    mine: byHandle.map(group => { const on = waits(group.scope.loopId), parent = group.team.handle.includes('/') ? byHandle.find(each => each.team.handle === group.team.handle.split('/')[0]) : null;
      return { id: group.scope.loopId, name: group.team.name, handle: group.team.handle, href: hrefOf(group.team.handle), inside: parent?.team.name ?? null, ...(members.get(group.scope.loopId) ?? { people: 0, faces: [] }), picture: pictures[group.scope.loopId] ? groupPictureSrc(pictures[group.scope.loopId]) : null, next: on[0] || null, on: on.length }; }),
    claims: read.claims.map(({ team, scope, record }) => ({ id: `${scope.loopId}:c:${record.number}`, scope, number: record.number, what: record.what ?? '', group: team.name, by: record.by.handle ?? 'A teammate', due: record.dueOn ?? null })),
    // "@club" is the tag "club"; "@club/vietnam" is "club-vietnam": a tag has no slash.
    groups: read.groups.filter(group => group.posts).map(group => ({ tag: group.team.handle.slice(1).replace('/', '-'), name: group.team.name, scope: group.scope, timezone: group.timezone })) };
}
