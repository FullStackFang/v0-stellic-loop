import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { findCampus } from '@/lib/campus/listings';
import { setRecordPublic } from '@/lib/campus/record';
import PublicPlacePage, { generateMetadata as placeMetadata } from './[campus]/[place]/page';
import PublicEventPage from '../events/[id]/page';

// Spec: openspec/changes/campus-public-places/specs/public-places, the pages. The pages ask nothing about who is looking.
const asked = vi.hoisted(() => ({ viewer: 0, signedIn: false }));
vi.mock('@/lib/campus/session', async original => ({ ...await original<object>(), campusViewer: async () => { asked.viewer++; return asked.signedIn ? { personId: 'x' } : null; } }));
vi.mock('@/lib/emba/clerk-identity', () => ({ clerkPortalConfigured: () => true }));
vi.mock('@clerk/nextjs', () => ({ ClerkProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="sign-in-provider">{children}</div> }));
vi.mock('next/navigation', async original => ({ ...await original<object>(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/places/cornell/nisi' }));

const NOW = new Date('2026-11-24T17:00:00Z');   // noon on Tuesday 24 November in New York
const at = (hours: number) => new Date(NOW.getTime() + hours * 3600000).toISOString();
let t: TestDb, campusId: string, nisi: string, people: { id: string; name: string }[];
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
afterEach(() => { vi.useRealTimers(); asked.viewer = 0; asked.signedIn = false; });
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  await t.reset();
  for (const table of ['campus_listing', 'campus_place', 'campus_feed']) await t.db.query(`delete from ${table}`);
  campusId = (await findCampus(t.db, 'cornell'))!.id;
  nisi = (await t.db.query<{ id: string }>("insert into campus_place(campus_id,name,other_names,lat,lon) values($1,'Nisi Bistro','{Nisi}',42.44,-76.48) returning id", [campusId])).rows[0].id;
  people = await Promise.all(['Ana Lopez', 'Dev Shah'].map(async name => ({ id: (await makePerson(t.db, name)).id, name })));
});
let seq = 0;
async function event(title: string, hours: number, origin: 'feed' | 'hand' | 'member' = 'feed', going: { id: string }[] = []) {
  const feed = origin === 'feed' ? (await t.db.query<{ id: string }>("insert into campus_feed(campus_id,source,url) values($1,'Luma',$2) returning id", [campusId, `https://lu.ma/${seq}.ics`])).rows[0].id : null;
  const { rows: [row] } = await t.db.query<{ id: string }>("insert into campus_listing(campus_id,origin,feed_id,feed_item_id,title,about,host_name,place_id,starts_at,posted_by) values($1,$2,$3,$4,$5,'Live music, bring friends','Nisi',$6,$7,$8) returning id",
    [campusId, origin, feed, feed && `item-${seq++}`, title, nisi, at(hours), origin === 'member' ? people[0].id : null]);
  if (going.length) {
    const { rows: [outing] } = await t.db.query<{ id: string }>('insert into campus_outing(listing_id,token) values($1,$2) returning id', [row.id, `pubpage${String(seq++).padStart(12, '0')}`]);
    for (const person of going) await t.db.query('insert into campus_outing_member(outing_id,listing_id,person_id) values($1,$2,$3)', [outing.id, row.id, person.id]);
  }
  return row.id;
}
const placeProps = (place = 'nisi', campus = 'cornell') => ({ params: Promise.resolve({ campus, place }) });
const eventProps = (id: string) => ({ params: Promise.resolve({ id }) });
/** The first HTML response, as a client that runs no script reads it (React's markers between text pieces dropped). */
const read = (element: React.ReactElement) => renderToString(element).replace(/<!-- -->/g, '');
const placeHtml = async (place?: string) => read(await PublicPlacePage(placeProps(place)));
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404/;

it('a place page holds its events, their counts and times, structured data and the way in, with no script run', async () => {
  await event('Greek night', 32, 'feed', people);
  await event('Quiz', 56, 'hand');
  await event('Brunch on the water', 70);
  await event('Ana and Dev dinner', 30, 'member', people);
  const html = await placeHtml();
  for (const text of ['Nisi Bistro', 'This week', 'Greek night', 'Quiz', 'Brunch on the water', '2 going', '0 going', 'From Luma', 'Wed 25', '8pm',
    'Sign in with a school email to see who you know and to go.', 'Counts as of', '"@type":"Place"', '"@type":"Event"']) expect(html).toContain(text);
  expect(html).toContain(`dateTime="${at(32)}"`);
  expect(html).toContain('href="/sign-in?redirect_url=%2Fc%2Fcornell"');
  expect(html).not.toContain('Ana and Dev dinner');
  for (const person of people) { expect(html).not.toContain(person.id); for (const part of person.name.split(' ')) expect(html).not.toContain(part); }
  expect(html).not.toContain('lu.ma');
  expect((await placeMetadata(placeProps())).title).toBe('Nisi Bistro · Cornell · Loopd');
});

it('is the same page signed in and signed out, and never asks who is looking', async () => {
  await event('Greek night', 32, 'feed', people);
  const out = await placeHtml();
  asked.signedIn = true;
  expect(await placeHtml()).toBe(out);
  expect(asked.viewer).toBe(0);
  expect(out).not.toContain('sign-in-provider');
});

it('wears the campus school colours on the bar, the page and the foot, whatever this browser last wore', async () => {
  await event('Greek night', 32);
  const html = await placeHtml();
  expect(html).toContain('class="cs-pub-kit" data-kit="cornell"');
  expect(html).toMatch(/<footer class="cs-ft" data-kit="cornell"/);
  expect(html.indexOf('cs-pub-kit')).toBeLessThan(html.indexOf('cs-nav'));
});

it('shows the record numbers once public, and is found on the record alone', async () => {
  await setRecordPublic(t.db, nisi, true);
  const html = await placeHtml();
  expect(html).toContain('showed up in 8 weeks');
  expect(html).toContain('came back');
  expect(html).toContain('Nothing is listed here for the next seven days.');
});

it('is not found with nothing public on, for an unknown place, or at another campus', async () => {
  await event('Ana and Dev dinner', 30, 'member');
  await expect(PublicPlacePage(placeProps())).rejects.toThrow(NOT_FOUND);
  await event('Far off', 24 * 20);
  await expect(PublicPlacePage(placeProps())).rejects.toThrow(NOT_FOUND);
  await expect(PublicPlacePage(placeProps('nowhere'))).rejects.toThrow(NOT_FOUND);
  await event('Greek night', 32);
  await expect(PublicPlacePage(placeProps('nisi', 'columbia'))).rejects.toThrow(NOT_FOUND);
  expect(await placeMetadata(placeProps('nowhere'))).toEqual({});
});

it('an event page holds its facts and count, names the source with no link out, and links its place', async () => {
  const id = await event('Greek night', 32, 'feed', people);
  const html = read(await PublicEventPage(eventProps(id)));
  for (const text of ['Greek night', 'Wed 25, 8pm', 'Nisi Bistro', '2 going', 'Nisi · From Luma', 'Live music, bring friends', '"@type":"Event"', 'Sign in with a school email']) expect(html).toContain(text);
  expect(html).toContain('href="/places/cornell/nisi"');
  expect(html).not.toContain('lu.ma');
  for (const person of people) expect(html).not.toContain(person.id);
});

it('an event page is not found for a plan, an ended event, a hidden one, or a bad id', async () => {
  const plan = await event('Ana and Dev dinner', 30, 'member'), ended = await event('Yesterday', -26), hidden = await event('Hidden', 30);
  await t.db.query('update campus_listing set hidden_at=now() where id=$1', [hidden]);
  for (const id of [plan, ended, hidden, 'not-an-id', '00000000-0000-0000-0000-000000000000']) await expect(PublicEventPage(eventProps(id))).rejects.toThrow(NOT_FOUND);
});
