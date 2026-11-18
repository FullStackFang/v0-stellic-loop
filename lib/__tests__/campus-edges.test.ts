// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate } from '@/lib/emba/access';
import { deletePersonalData } from '@/lib/emba/privacy';
import { CampusError } from '@/lib/campus/errors';
import { readFeeds } from '@/lib/campus/import';
import { findCampus, type Campus } from '@/lib/campus/listings';
import { addFeed, addHandListing } from '@/lib/campus/manage';
import { checkIn, imIn, joinByToken } from '@/lib/campus/outings';
import { postPlan } from '@/lib/campus/plans';
import { saveReward, useBuildingReward, useGroupReward } from '@/lib/campus/rewards';
import { campusScreen } from '@/lib/campus/screen';
import { fit } from '@/lib/campus/search';

// Cases an independent review of loop-campus-rewards found (tasks 4.9 and 7.7), each pinned here.
let t: TestDb, cornell: Campus;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from campus_feed'); await t.db.query('delete from campus_place'); cornell = (await findCampus(t.db, 'cornell'))!; });

const NOW = new Date('2026-11-17T17:00:00Z');   // noon on Tuesday in New York
const hours = (n: number) => new Date(NOW.getTime() + n * 3600000);
const person = async (name = 'P') => (await makePerson(t.db, name)).id;
const event = async (over: { title?: string; at?: Date; end?: Date; host?: string; place?: string } = {}) =>
  (await addHandListing(t.db, { campusId: cornell.id, title: over.title ?? 'Study group', startsAt: (over.at ?? NOW).toISOString(), endsAt: over.end?.toISOString(), host: over.host, place: over.place })).id;
/** One outing on an event: everyone is in and checks in, at the event's start. */
async function together(listing: string, people: string[], at: Date = NOW) {
  const { token } = await imIn(t.db, people[0], listing, at);
  for (const id of people.slice(1)) await joinByToken(t.db, id, token, at);
  for (const id of people) await checkIn(t.db, id, listing, at);
}
const noPhotos = async () => ({});
const see = (personId: string | null, now: Date = NOW) => campusScreen(t.db, cornell, personId ? { personId, admin: false } : null, { now, photos: noPhotos });

it('a reward unlocked at the end of an event can still be shown and marked used after it ends, for a day', async () => {
  const [a, b] = [await person('Ana'), await person('Ben')], cafe = await event({ end: hours(1) });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Northside Coffee', kind: 'group', listingId: cafe, headCount: 2, texts: ['A drink and a pastry'] });
  await together(cafe, [a, b], hours(0.9));
  const after = await see(a, hours(3));
  expect(after.live).toMatchObject({ listingId: cafe, text: 'A drink and a pastry', usedAt: null });
  expect(after.tickets.find(ticket => ticket.id === cafe)).toMatchObject({ action: 'use' });
  // Someone who was not there does not get yesterday's events back.
  expect((await see(await person('Cy'), hours(3))).tickets).toHaveLength(0);
  await useGroupReward(t.db, a, cafe);
  expect((await see(b, hours(3))).live?.usedAt).toBeTruthy();
  expect((await see(a, hours(30))).tickets).toHaveLength(0);
});

it('the top bar holds a reward still to be used before one already used', async () => {
  const [a, b] = [await person('Ana'), await person('Ben')], first = await event({ title: 'First', end: hours(2) }), second = await event({ title: 'Second', at: hours(0.5), end: hours(2) });
  for (const listing of [first, second]) await saveReward(t.db, { campusId: cornell.id, giver: 'Cafe', kind: 'group', listingId: listing, headCount: 2, texts: [`Free at ${listing === first ? 'first' : 'second'}`] });
  await together(first, [a, b]); await together(second, [a, b], hours(0.5));
  await useGroupReward(t.db, a, first);
  expect((await see(a, hours(1))).live).toMatchObject({ listingId: second, usedAt: null });
});

it('an outing uses its reward once whatever the levels in it, and a higher level\'s words never reach a lower level', async () => {
  const [regular, member, friend] = [await person('Rae'), await person('Mel'), await person('Flo')];
  for (let n = 5; n >= 1; n--) await together(await event({ title: `Earlier ${n}`, at: hours(-24 * n), end: hours(-24 * n + 1) }), [regular, friend], hours(-24 * n));
  const cafe = await event({ host: 'Bao House', end: hours(2) });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Bao House', kind: 'group', listingId: cafe, headCount: 2, texts: [null, 'Regulars: starters on the house'] });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Bao House', kind: 'group', hostName: 'Bao House', headCount: 2, texts: ['Tea on the house'] });
  await together(cafe, [regular, member]);
  const first = await useGroupReward(t.db, regular, cafe);
  expect(await useGroupReward(t.db, member, cafe)).toEqual(first);
  expect((await t.db.query('select 1 from campus_reward_use')).rows).toHaveLength(1);
  const seen = await see(member, hours(1));
  expect(JSON.stringify(seen)).not.toContain('Regulars: starters');
  // The member sees their own level's reward on the event, as used.
  expect(seen.tickets.find(ticket => ticket.id === cafe)?.stub).toMatchObject({ kind: 'group', text: 'Tea on the house' });
  expect(seen.live?.usedAt).toBeTruthy();
});

it('a reward that exists only above a person\'s level is not shown to them even once their outing used it', async () => {
  const [regular, member, friend] = [await person('Rae'), await person('Mel'), await person('Flo')];
  for (let n = 5; n >= 1; n--) await together(await event({ title: `Earlier ${n}`, at: hours(-24 * n), end: hours(-24 * n + 1) }), [regular, friend], hours(-24 * n));
  const cafe = await event({ end: hours(2) });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Bao House', kind: 'group', listingId: cafe, headCount: 2, texts: [null, 'Regulars: starters on the house'] });
  await together(cafe, [regular, member]);
  await useGroupReward(t.db, regular, cafe);
  const seen = await see(member, hours(1));
  expect(JSON.stringify(seen)).not.toContain('Regulars');
  expect(seen.live).toBeNull();
});

it('a reward on a name rides on events at the place of that name, a posted plan included', async () => {
  await t.db.query("insert into campus_place(campus_id,name,lat,lon) values($1,'Northside Coffee',42.45,-76.48)", [cornell.id]);
  await saveReward(t.db, { campusId: cornell.id, giver: 'Northside Coffee', kind: 'group', hostName: 'Northside Coffee', headCount: 3, texts: ['A drink and a pastry'] });
  const poster = await person('Ana'), plan = await postPlan(t.db, poster, cornell, { title: 'Problem set', starts: '2026-11-17T18:00', place: 'Northside Coffee, the back table' }, NOW);
  expect((await see(poster)).tickets.find(ticket => ticket.id === plan.id)?.stub).toMatchObject({ kind: 'group', text: 'A drink and a pastry' });
});

it('a building reward of another school cannot be marked used', async () => {
  const [a, b] = [await person(), await person()], nyu = (await findCampus(t.db, 'nyu'))!;
  const made = await saveReward(t.db, { campusId: nyu.id, giver: 'Bagels', kind: 'building', texts: ['$5 off'], rule: 'outings', ruleCount: 1 });
  await together(await event({ end: hours(1) }), [a, b]);
  await expect(useBuildingReward(t.db, a, made.id, cornell, hours(0.5))).rejects.toBeInstanceOf(CampusError);
  expect((await useBuildingReward(t.db, a, made.id, nyu, hours(0.5))).usedAt).toBeTruthy();
});

it('a used building reward stays on the shelf for a week, saying when, with nothing to press', async () => {
  const [a, b] = [await person(), await person()];
  const made = await saveReward(t.db, { campusId: cornell.id, giver: 'Bagels', kind: 'building', texts: ['$5 off'], rule: 'outings', ruleCount: 1 });
  await together(await event({ end: hours(1) }), [a, b]);
  await useBuildingReward(t.db, a, made.id, cornell);
  await t.db.query('update campus_reward_use set used_at=$1', [hours(1).toISOString()]);
  expect((await see(a, hours(2))).earning).toMatchObject([{ id: made.id, usedAt: expect.any(String), progress: 'Used Today, 1pm' }]);
  expect((await see(a, hours(24 * 8))).earning).toEqual([]);
});

it('a plan beyond this week is on its poster\'s screen, where they can change it, and on nobody else\'s yet', async () => {
  const poster = await person('Ana'), plan = await postPlan(t.db, poster, cornell, { title: 'Gorge hike', starts: '2026-11-27T10:00' }, NOW);
  expect((await see(poster)).tickets.find(ticket => ticket.id === plan.id)?.mine).toMatchObject({ canEdit: true });
  expect((await see(await person('Cy'))).tickets).toHaveLength(0);
  expect((await see(null)).tickets).toHaveLength(0);
});

it('a plan ends within a day of its start', async () => {
  const poster = await person('Ana');
  await expect(postPlan(t.db, poster, cornell, { title: 'Couch for sale', starts: '2026-11-17T18:00', ends: '2026-12-25T18:00' }, NOW)).rejects.toThrow('within a day');
  expect((await postPlan(t.db, poster, cornell, { title: 'Overnight hike', starts: '2026-11-17T18:00', ends: '2026-11-18T12:00' }, NOW)).id).toBeTruthy();
});

it('a typed word finds a title word it begins, never a shorter title word inside it', () => {
  const item = (title: string, words: string[] = []) => ({ id: title, title, host: 'The Outing Club', place: null, source: 'CampusGroups', words, pull: 0 });
  expect(fit(item('The social'), 'theater')).toBe(0);
  expect(fit(item('Improv night', ['theater']), 'theater')).toBe(2);
  expect(fit(item('Morning miles', ['run']), 'running')).toBe(2);
  expect(fit(item('Outing'), 'out')).toBe(3);
  // The name of the calendar an event came from is not something to search by.
  expect(fit(item('Resume drop-in'), 'campus')).toBe(0);
});

it('deleting a person\'s data takes their campus records and cancels the plans they had coming', async () => {
  const id = await person('Ana Lopez'), other = await person('Ben');
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [id, id]);
  const ana = (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: id, expiresAt: Date.now() + 600000, authenticatedAt: Date.now(), verifiedEmail: 'ana@cornell.edu' })))!;
  await t.db.query('insert into campus_person(person_id,campus_id) values($1,$2)', [id, cornell.id]);
  const soon = new Date(Date.now() + 26 * 3600000).toISOString().slice(0, 16), plan = await postPlan(t.db, id, { id: cornell.id, tz: 'UTC' }, { title: 'Sunset run', starts: soon });
  await joinByToken(t.db, other, plan.token);
  await deletePersonalData(t.db, ana);
  for (const table of ['campus_person', 'campus_outing_member']) expect((await t.db.query(`select 1 from ${table} where person_id=$1`, [id])).rows).toHaveLength(0);
  expect((await t.db.query<{ by: string | null; cancelled: boolean }>('select posted_by as by,cancelled_at is not null as cancelled from campus_listing where id=$1', [plan.id])).rows).toEqual([{ by: null, cancelled: true }]);
});

it('the hourly read leaves long-ended events as they are', async () => {
  const feed = await addFeed(t.db, { campusId: cornell.id, source: 'CampusGroups', url: 'https://feeds.test/a.ics' });
  const stamp = (at: Date) => at.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const ics = (...events: [string, Date][]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.map(([uid, at]) => `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:Event ${uid}\r\nDTSTART:${stamp(at)}\r\nDTEND:${stamp(new Date(at.getTime() + 3600000))}\r\nEND:VEVENT\r\n`).join('')}END:VCALENDAR\r\n`;
  await readFeeds(t.db, { now: NOW, fetch: async () => ics(['old', hours(2)], ['next', hours(200)]) });
  // Ten days on, the feed has dropped the first event and still lists the second.
  const later = hours(240);
  expect(await readFeeds(t.db, { now: later, fetch: async () => ics(['next', hours(200)], ['new', hours(250)]) })).toEqual({ feeds: 1, failed: 0 });
  const { rows } = await t.db.query<{ item: string; gone: boolean }>('select feed_item_id as item,left_feed_at is not null as gone from campus_listing where feed_id=$1 order by starts_at', [feed.id]);
  expect(rows).toEqual([{ item: 'old', gone: false }, { item: 'next', gone: false }, { item: 'new', gone: false }]);
});
