// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { findCampus, listCampuses } from '@/lib/campus/listings';
import { recordLink, setRecordPublic } from '@/lib/campus/record';
import { siteUrl } from '@/lib/campus/public';
import { GET as llms } from './llms.txt/route';
import { GET as ask } from './api/ask/route';
import sitemap from './sitemap';
import robots from './robots';

// Spec: openspec/changes/campus-public-places/specs/public-places: the guide file, the ask address, the sitemap and robots.
// None of them reads a cookie.
vi.mock('next/headers', () => ({ cookies: () => { throw new Error('read a cookie'); }, headers: () => { throw new Error('read a header'); } }));

const NOW = new Date('2026-11-24T17:00:00Z');   // noon on Tuesday 24 November in New York
const at = (hours: number) => new Date(NOW.getTime() + hours * 3600000).toISOString();
let t: TestDb, tech: string, nisi: string, other: string;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
afterEach(() => { vi.useRealTimers(); });
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  await t.reset();
  for (const table of ['campus_listing', 'campus_place', 'campus_feed']) await t.db.query(`delete from ${table}`);
  tech = (await findCampus(t.db, 'cornell-tech'))!.id;
  const place = async (name: string, others: string) => (await t.db.query<{ id: string }>('insert into campus_place(campus_id,name,other_names,lat,lon) values($1,$2,$3,40.7614,-73.9505) returning id', [tech, name, [others]])).rows[0].id;
  nisi = await place('Nisi Bistro', 'Nisi'); other = await place('Granny Annie’s', 'Grannys');
});
async function event(title: string, hours: number, origin: 'hand' | 'member' = 'hand', place = nisi) {
  const poster = origin === 'member' ? (await makePerson(t.db, 'Ana Lopez')).id : null;
  return (await t.db.query<{ id: string }>('insert into campus_listing(campus_id,origin,title,place_id,starts_at,posted_by) values($1,$2,$3,$4,$5,$6) returning id', [tech, origin, title, place, at(hours), poster])).rows[0].id;
}
const get = async (query: string) => { const response = await ask(new NextRequest(`http://localhost/api/ask${query}`)); return { response, body: await response.json() }; };

describe('the guide file', () => {
  it('is plain text naming every campus, the page patterns, the ask address and what is not here', async () => {
    const response = await llms(), text = await response.text();
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
    for (const campus of await listCampuses(t.db)) { expect(text).toContain(campus.name); expect(text).toContain(`near=${campus.slug}`); }
    for (const part of ['/places/{campus}/{place}', '/events/{id}', '/api/ask', 'when={today|tonight|tomorrow|week}', 'What you will not find']) expect(text).toContain(part);
  });
  it('names a campus the admin adds, with no code change', async () => {
    await t.db.query("insert into campus(slug,name,tz) values('pratt','Pratt','America/New_York')");
    expect(await (await llms()).text()).toContain('- Pratt (near=pratt)');
  });
});

describe('the ask address', () => {
  it('answers tonight near a campus: from 5pm, soonest first, with counts and page addresses, cached five minutes', async () => {
    const late = await event('Late quiz', 9), early = await event('Greek night', 6);
    await event('Lunch', 1); await event('Tomorrow', 30); await event('Ana and Dev dinner', 7, 'member');
    const { response, body } = await get('?near=cornell-tech&for=4&when=tonight');
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=60');
    expect(body).toMatchObject({ near: 'cornell-tech', campus: 'Cornell Tech', for: 4, when: 'tonight', from: '2026-11-24T22:00:00.000Z' });
    expect(body.events).toEqual([
      { title: 'Greek night', start: at(6), end: null, place: 'Nisi Bistro', page: siteUrl(`/events/${early}`), going: 0 },
      { title: 'Late quiz', start: at(9), end: null, place: 'Nisi Bistro', page: siteUrl(`/events/${late}`), going: 0 }]);
  });
  it('gives at most 20', async () => {
    for (let i = 0; i < 23; i++) await event(`Night ${i}`, 24 + i);
    expect((await get('?near=cornell-tech&when=week')).body.events).toHaveLength(20);
  });
  it('an unknown campus gets an empty list and the campuses there are', async () => {
    const { body } = await get('?near=hogwarts&when=tonight');
    expect(body.events).toEqual([]);
    expect(body.campuses).toContainEqual({ slug: 'cornell-tech', name: 'Cornell Tech' });
  });
  it('nothing asked gets the campuses and how to ask', async () => {
    const { response, body } = await get('');
    expect(response.status).toBe(200);
    expect(body.how).toBe('GET /api/ask?near={campus}&for={people}&when={today|tonight|tomorrow|week}');
    expect(body.campuses.map((c: { slug: string }) => c.slug)).toContain('cornell-tech');
  });
  it('a bad `for` or `when` is no error: `for` comes back empty and `when` is the week', async () => {
    await event('Greek night', 30);
    for (const query of ['?near=cornell-tech&for=lots&when=someday', '?near=cornell-tech&for=-3', '?near=cornell-tech&for=2.5&when=']) {
      const { response, body } = await get(query);
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ for: null, when: 'week' });
      expect(body.events).toHaveLength(1);
    }
  });
});

describe('the sitemap and robots', () => {
  it('lists public place and event pages, a public record, and nothing under /c or a private record', async () => {
    const id = await event('Greek night', 30), plan = await event('Ana and Dev dinner', 30, 'member', other);
    await recordLink(t.db, other);   // private: a key, not public
    const urls = (await sitemap()).map(page => page.url);
    expect(urls).toContain(siteUrl('/places/cornell-tech/nisi'));
    expect(urls).toContain(siteUrl(`/events/${id}`));
    expect(urls.some(url => url.includes(plan) || url.includes('grannys'))).toBe(false);
    expect(urls.some(url => url.includes('/c/') || url.includes('record'))).toBe(false);
    await setRecordPublic(t.db, other, true);
    expect((await sitemap()).map(page => page.url)).toContain(siteUrl('/places/cornell-tech/grannys/record'));
  });
  it('robots keeps the board blocks and points to the sitemap', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: ['/b/', '/p/'] }, sitemap: siteUrl('/sitemap.xml') });
  });
});
