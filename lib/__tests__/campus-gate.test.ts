// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, type NextFetchEvent } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server.js';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import type { Principal } from '@/lib/emba/access';
import { closedToCaller, getPortalPrincipal, getSignedInPrincipal, withPortalTestSession } from '@/lib/emba/portal-session';
import { listCampuses } from '@/lib/campus/listings';
import { campusOf, placeAt } from '@/lib/campus/people';
import { frontIsCampus, schoolOfEmail } from '@/lib/campus/schools';
import { campusViewer, mayUse, openableGroups, whereFrom } from '@/lib/campus/session';
import { config, leadsIntoGroups, proxy } from '@/proxy';

// Specs: openspec/changes/loop-campus-rewards/specs/admin-gate and campus-sign-in.
let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => vi.unstubAllEnvs());

const who = (over: Partial<Principal> = {}) => ({ personId: 'p1', issuer: 'https://issuer.test', subject: 'user_student', verifiedEmail: 'sam@cornell.edu', ...over }) as Principal;
const GROUPS = ['/groups', '/groups/team-1', '/groups/team-1/in/sub/team', '/groups/archive', '/groups/connections', '/groups/new', '/groups/reach', '/groups/metrics/export', '/emba', '/e/sometoken'];
const OPEN = ['/', '/c/cornell', '/c/admin', '/o/sometoken', '/sign-in', '/groups/sign-in', '/groups/sign-in/sso-callback', '/emba/sign-in', '/groups/reach/stop/abc', '/api/emba/documents/1',
  // An ask's page and the emailed answer link decide for themselves who they open for (loop-on-you, design D12).
  '/groups/reach/answer/abc', '/a/sometoken'];

describe('which pages lead into groups', () => {
  it.each(GROUPS)('%s does', path => expect(leadsIntoGroups(path)).toBe(true));
  it.each([...OPEN, '/privacy', '/terms', '/demo/quorum', '/api/mcp/team', '/api/cron/reach', '/api/reach/stop/abc', '/.well-known/oauth-protected-resource', '/groupsomething', '/each'])('%s does not', path => expect(leadsIntoGroups(path)).toBe(false));
});

describe('the proxy', () => {
  const visit = (path: string) => proxy(new NextRequest(`https://loop.test${path}`), { waitUntil() {} } as unknown as NextFetchEvent) as Response;
  it.each(['/', '/c/cornell', '/c/cornell/post', '/o/abc', '/sign-in', '/sign-in/sso-callback', '/groups', '/groups/x/team', '/emba', '/e/t', '/a/t'])('runs for %s', url => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  });
  it.each(['/privacy', '/terms', '/demo/quorum', '/api/mcp/team', '/api/cron/campus-feeds', '/api/reach/stop/abc'])('never runs for %s, so it is never gated', url => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  });
  it('with the flag unset lets every page through as today', () => {
    for (const path of [...GROUPS, ...OPEN]) { const response = visit(path); expect(response.headers.get('location')).toBeNull(); expect(response.status).toBe(200); }
  });
  it('with the flag on and nobody who could be the admin, sends every groups page to the front door', () => {
    vi.stubEnv('LOOP_FRONT', 'campus');
    for (const path of GROUPS) { const response = visit(path); expect(response.status).toBe(307); expect(response.headers.get('location')).toBe('https://loop.test/'); }
  });
  it('with the flag on keeps the campus, sign-in and the stop link open', () => {
    vi.stubEnv('LOOP_FRONT', 'campus');
    for (const path of OPEN) expect(visit(path).headers.get('location')).toBeNull();
  });
});

describe('the groups site asks who is signed in', () => {
  it('the campus is in front unless LOOP_FRONT=groups says otherwise', () => {
    expect(frontIsCampus()).toBe(false);   // the tests of the groups site run with LOOP_FRONT=groups (vitest.setup.ts)
    vi.stubEnv('LOOP_FRONT', undefined);
    expect(frontIsCampus()).toBe(true);
    vi.stubEnv('LOOP_FRONT', 'campus');
    expect(frontIsCampus()).toBe(true);
  });
  it('with the groups site in front, a member is who they are', async () => {
    expect(frontIsCampus()).toBe(false);
    expect(await withPortalTestSession(who(), () => getPortalPrincipal())).toMatchObject({ subject: 'user_student' });
    expect(await withPortalTestSession(who(), () => closedToCaller())).toBe(false);
  });
  it('by default, anyone but the admin is no one to it, and still someone to the campus screen', async () => {
    vi.stubEnv('LOOP_FRONT', undefined); vi.stubEnv('LOOP_ADMIN', 'founder@cornell.edu');
    expect(await withPortalTestSession(who(), () => getPortalPrincipal())).toBeNull();
    expect(await withPortalTestSession(who(), () => getSignedInPrincipal())).toMatchObject({ subject: 'user_student' });
    expect(await withPortalTestSession(who(), () => closedToCaller())).toBe(true);
    expect(await closedToCaller()).toBe(true);   // signed out
    const founder = who({ subject: 'user_founder', verifiedEmail: 'founder@cornell.edu' });
    expect(await withPortalTestSession(founder, () => getPortalPrincipal())).toMatchObject({ subject: 'user_founder' });
    expect(await withPortalTestSession(founder, () => closedToCaller())).toBe(false);
  });
  it('with the flag on and LOOP_ADMIN empty, nobody opens it', async () => {
    vi.stubEnv('LOOP_FRONT', 'campus'); vi.stubEnv('LOOP_ADMIN', '');
    expect(await withPortalTestSession(who({ subject: 'user_founder', verifiedEmail: 'founder@cornell.edu' }), () => getPortalPrincipal())).toBeNull();
  });
});

describe('a person belongs to the school of their email', () => {
  it('counts subdomains, and an address at no school has none', async () => {
    const schools = await listCampuses(t.db), school = (email: string | null) => schoolOfEmail(schools, email)?.slug ?? null;
    expect(school('netid@cornell.edu')).toBe('cornell');
    expect(school('Name@Stern.NYU.edu')).toBe('nyu');
    expect(school('you@baruch.cuny.edu')).toBe('cuny');
    expect(school('uni@alumni.columbia.edu')).toBe('columbia');
    for (const none of ['someone@gmail.com', 'x@notcornell.edu', 'x@cornell.edu.evil.com', 'cornell.edu', '', null]) expect(school(none)).toBeNull();
  });
  it('places a person once, at the school of their verified email, whatever they pick later', async () => {
    const { id } = await makePerson(t.db, 'Noor');
    expect((await campusOf(t.db, { personId: id, verifiedEmail: 'noor@stern.nyu.edu' }))?.slug).toBe('nyu');
    // Placed once: a different address on a later visit does not move them.
    expect((await campusOf(t.db, { personId: id, verifiedEmail: 'noor@cornell.edu' }))?.slug).toBe('nyu');
    expect((await t.db.query('select 1 from campus_person where person_id=$1', [id])).rows).toHaveLength(1);
  });
  it('does not place a person whose email is at no school, and opens no campus for them; the admin opens any', async () => {
    const { id } = await makePerson(t.db, 'Omar'), omar = who({ personId: id, subject: 'user_omar', verifiedEmail: 'omar@gmail.com' });
    const [cornell] = (await listCampuses(t.db)).filter(campus => campus.slug === 'cornell');
    const viewer = (await withPortalTestSession(omar, () => campusViewer()))!;
    expect(viewer).toMatchObject({ admin: false, campus: null, visits: [] });
    for (const campus of await listCampuses(t.db)) expect(mayUse(viewer, campus)).toBe(false);
    expect((await t.db.query('select 1 from campus_person')).rows).toHaveLength(0);
    vi.stubEnv('LOOP_ADMIN', 'user_omar');
    const admin = (await withPortalTestSession(omar, () => campusViewer()))!;
    expect(admin).toMatchObject({ admin: true, campus: { slug: 'cornell' } });
    expect(mayUse(admin, cornell)).toBe(true);
    expect(mayUse(admin, (await listCampuses(t.db)).find(campus => campus.slug === 'nyu')!)).toBe(true);
  });
  it('lets a Cornell person look at Cornell Tech without moving there, and nobody is placed there by their email', async () => {
    const { id } = await makePerson(t.db, 'Sam'), sam = who({ personId: id });
    const all = await listCampuses(t.db), tech = all.find(campus => campus.slug === 'cornell-tech')!, nyu = all.find(campus => campus.slug === 'nyu')!;
    expect(schoolOfEmail(all, 'sam@cornell.edu')?.slug).toBe('cornell');
    const viewer = (await withPortalTestSession(sam, () => campusViewer()))!;
    expect(viewer).toMatchObject({ campus: { slug: 'cornell' }, kit: 'cornell', visits: [tech.id] });
    expect(mayUse(viewer, tech)).toBe(true);
    expect(mayUse(viewer, nyu)).toBe(false);
    // Opening the other campus does not move them.
    expect((await campusOf(t.db, sam))?.slug).toBe('cornell');
    const { id: other } = await makePerson(t.db, 'Noor');
    const noor = (await withPortalTestSession(who({ personId: other, subject: 'user_noor', verifiedEmail: 'noor@nyu.edu' }), () => campusViewer()))!;
    expect(noor.visits).toEqual([]);
    expect(mayUse(noor, tech)).toBe(false);
  });
  it('moves a person to another campus of their school when they ask, and to no other school', async () => {
    const { id } = await makePerson(t.db, 'Sam'), sam = who({ personId: id });
    const all = await listCampuses(t.db), ithaca = all.find(campus => campus.slug === 'cornell')!, tech = all.find(campus => campus.slug === 'cornell-tech')!, nyu = all.find(campus => campus.slug === 'nyu')!;
    // Not placed yet: there is nothing to change.
    await expect(placeAt(t.db, id, tech.id)).rejects.toThrow('That campus is not part of your school.');
    await campusOf(t.db, sam);
    await expect(placeAt(t.db, id, nyu.id)).rejects.toThrow('That campus is not part of your school.');
    await placeAt(t.db, id, tech.id);
    // New York is now their own, Ithaca is the one they visit, and the kit is still Cornell's.
    const viewer = (await withPortalTestSession(sam, () => campusViewer()))!;
    expect(viewer).toMatchObject({ campus: { slug: 'cornell-tech' }, kit: 'cornell', visits: [ithaca.id] });
    expect(mayUse(viewer, ithaca)).toBe(true);
    await placeAt(t.db, id, ithaca.id);
    expect((await campusOf(t.db, sam))?.slug).toBe('cornell');
    expect((await t.db.query('select 1 from campus_person where person_id=$1', [id])).rows).toHaveLength(1);
  });
  it('places a new person at the nearer campus of their school, and at the school itself when nothing says where they are', async () => {
    const NEW_YORK: [number, number] = [-73.99, 40.73], SYRACUSE: [number, number] = [-76.15, 43.05];
    const place = async (name: string, email: string, near?: [number, number] | null) => (await campusOf(t.db, { personId: (await makePerson(t.db, name)).id, verifiedEmail: email }, near))?.slug;
    expect(await place('Tess', 'tess@cornell.edu', NEW_YORK)).toBe('cornell-tech');
    expect(await place('Ira', 'ira@cornell.edu', SYRACUSE)).toBe('cornell');
    expect(await place('Sam', 'sam@cornell.edu', null)).toBe('cornell');
    expect(await place('Una', 'una@cornell.edu')).toBe('cornell');
    // A school with one campus places there wherever the person is.
    expect(await place('Noor', 'noor@nyu.edu', SYRACUSE)).toBe('nyu');
    expect(await place('Gus', 'gus@gmail.com', NEW_YORK)).toBeUndefined();
  });
  it('reads where a person seems to be from the host, and makes nothing of a missing or broken guess', () => {
    expect(whereFrom('40.73', '-73.99')).toEqual([-73.99, 40.73]);
    for (const [lat, lon] of [[null, '-73.99'], ['40.73', null], ['', ''], ['north', '-73.99'], ['140', '-73.99']] as const) expect(whereFrom(lat, lon)).toBeNull();
  });
  it('leaves a placed person where they are, wherever they sign in from', async () => {
    const { id } = await makePerson(t.db, 'Sam'), sam = who({ personId: id });
    expect((await campusOf(t.db, sam, [-76.15, 43.05]))?.slug).toBe('cornell');
    expect((await campusOf(t.db, sam, [-73.99, 40.73]))?.slug).toBe('cornell');
  });
  it('shows group names in the top bar only to someone who can open them', async () => {
    const { id } = await makePerson(t.db, 'Sam'), sam = who({ personId: id });
    vi.stubEnv('LOOP_FRONT', 'campus');
    const viewer = (await withPortalTestSession(sam, () => campusViewer()))!;
    expect(await openableGroups(viewer)).toEqual([]);
  });
  it('signed out, there is no viewer', async () => {
    expect(await campusViewer()).toBeNull();
  });
});
