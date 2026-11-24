import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { findCampus } from '@/lib/campus/listings';
import { recordLink, setRecordPublic } from '@/lib/campus/record';
import PlaceRecordPage, { generateMetadata } from './[campus]/[place]/record/page';

// Spec: openspec/changes/campus-venue-record/specs/venue-record, the page.
let t: TestDb, nisi: string, people: { id: string; name: string }[], tokens: string[];
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
afterEach(cleanup);
beforeEach(async () => {
  await t.reset(); await t.db.query('delete from campus_place'); await t.db.query('delete from campus_listing');
  const cornell = (await findCampus(t.db, 'cornell'))!;
  nisi = (await t.db.query<{ id: string }>("insert into campus_place(campus_id,name,other_names,lat,lon) values($1,'Nisi Bistro','{Nisi}',42.44,-76.48) returning id", [cornell.id])).rows[0].id;
  people = await Promise.all(['Ana Lopez', 'Dev Shah', 'Noor Haddad'].map(async name => ({ id: (await makePerson(t.db, name)).id, name })));
  tokens = [];
});
/** `n` groups at Nisi in the last few days, everyone checked in. */
async function groups(n: number) {
  for (let i = 0; i < n; i++) {
    const at = new Date(Date.now() - (i + 1) * 86400000).toISOString(), token = `page${String(i).padStart(16, '0')}`;
    const { rows: [listing] } = await t.db.query<{ id: string }>("insert into campus_listing(campus_id,origin,title,place_id,starts_at) values((select id from campus where slug='cornell'),'hand','Night out',$1,$2) returning id", [nisi, at]);
    const { rows: [outing] } = await t.db.query<{ id: string }>('insert into campus_outing(listing_id,token) values($1,$2) returning id', [listing.id, token]);
    tokens.push(token);
    for (const person of people) await t.db.query('insert into campus_outing_member(outing_id,listing_id,person_id,checked_in_at) values($1,$2,$3,$4)', [outing.id, listing.id, person.id, at]);
  }
}
const props = (search: Record<string, string> = {}, place = 'nisi') => ({ params: Promise.resolve({ campus: 'cornell', place }), searchParams: Promise.resolve(search) });
const open = async (search: Record<string, string> = {}) => render(await PlaceRecordPage(props(search)));
const notFound = (search: Record<string, string> = {}) => expect(PlaceRecordPage(props(search))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);

it('opens with the key, with the three numbers, the note and a not-to-be-listed mark', async () => {
  await groups(2);
  const key = await recordLink(t.db, nisi);
  await open({ k: key });
  expect(screen.getByRole('heading', { level: 1, name: 'Nisi Bistro' })).toBeTruthy();
  expect(screen.getByText('groups showed up').previousSibling?.textContent).toBe('2');
  expect(screen.getByText('groups said they were coming').previousSibling?.textContent).toBe('2');
  expect(screen.getByText('6 people')).toBeTruthy();
  expect(screen.getByText(/How a group is counted/)).toBeTruthy();
  // Two groups: no breakdown.
  expect(screen.queryByText('Groups that showed up, by week')).toBeNull();
  expect(screen.queryByText('How big the groups were')).toBeNull();
  expect((await generateMetadata(props({ k: key }))).robots).toEqual({ index: false, follow: false });
  // The span pills keep the key, and 8 weeks is the filled one.
  expect(screen.getByRole('link', { name: '4 weeks' }).getAttribute('href')).toBe(`/places/cornell/nisi/record?k=${key}&span=4`);
  expect(screen.getByRole('link', { name: '8 weeks' }).getAttribute('aria-current')).toBe('true');
});

it('is not found with no key, a wrong key, an unknown place, or before any link was made', async () => {
  await notFound();
  const key = await recordLink(t.db, nisi);
  await notFound();
  await notFound({ k: 'wrong-key-wrong-key-1234' });
  await expect(PlaceRecordPage(props({ k: key }, 'nowhere'))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
});

it('opens with no key once public, and may be listed', async () => {
  await setRecordPublic(t.db, nisi, true);
  await open();
  expect(screen.getByRole('heading', { level: 1, name: 'Nisi Bistro' })).toBeTruthy();
  expect((await generateMetadata(props())).robots).toBeUndefined();
  expect(screen.getByRole('link', { name: 'All time' }).getAttribute('href')).toBe('/places/cornell/nisi/record?span=all');
});

it('shows the breakdowns at five groups, recounts for the span, and holds no name, id or token of anyone', async () => {
  await groups(6);
  const key = await recordLink(t.db, nisi), { container } = await open({ k: key, span: '4' });
  expect(screen.getByText('Groups that showed up, by week')).toBeTruthy();
  expect(screen.getByText('How big the groups were')).toBeTruthy();
  expect(screen.getByText('When they came')).toBeTruthy();
  expect(screen.getByRole('link', { name: '4 weeks' }).getAttribute('aria-current')).toBe('true');
  expect(container.querySelectorAll('.cs-rec-weeks li')).toHaveLength(4);
  const html = container.innerHTML;
  for (const person of people) { expect(html).not.toContain(person.id); for (const part of person.name.split(' ')) expect(html).not.toContain(part); }
  for (const token of tokens) expect(html).not.toContain(token);
  expect(html).not.toContain(nisi);
});
