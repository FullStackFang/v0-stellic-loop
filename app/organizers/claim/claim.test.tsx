// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { askClubReview, clubClaims } from '@/lib/campus/club-claim';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ db: null as unknown, viewer: null as null | { personId: string; admin: boolean; campus: { domains: string[] } | null; principal: { verifiedEmail: string | null } }, claimed: [] as unknown[] }));
vi.mock('@/lib/db', async original => ({ ...(await original<typeof import('@/lib/db')>()), db: () => state.db }));
vi.mock('@/lib/campus/session', () => ({ campusViewer: async () => state.viewer, lookingAt: async () => ({ id: 'c', slug: 'cornell', name: 'Cornell', tz: 'America/New_York', domains: ['cornell.edu'], listSource: 'x' }), signInHref: (back: string) => `/sign-in?redirect_url=${encodeURIComponent(back)}` }));
vi.mock('@/lib/campus/listings', () => ({ findCampus: async () => ({ slug: 'cornell' }) }));
vi.mock('@/app/c/site-bar', () => ({ siteBar: async () => ({ bar: null, foot: null }) }));
vi.mock('./claim.css', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); }, notFound: () => { throw new Error('NOT FOUND'); } }));
// The check itself is covered in lib/__tests__/campus-club-claim.test.ts: here it only records who it was asked for.
vi.mock('@/lib/campus/club-claim', async original => ({ ...(await original<typeof import('@/lib/campus/club-claim')>()), claimClub: async (_db: unknown, who: unknown) => { state.claimed.push(who); return { state: 'bad link' }; } }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); state.db = t.db; });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); state.viewer = null; state.claimed = []; });

const LINK = 'https://cornell.campusgroups.com/SKI/';
const signIn = async (email: string | null = 'ana@cornell.edu', admin = false) => { const me = await makePerson(t.db, 'Ana Lopez'); state.viewer = { personId: me.id, admin, campus: { domains: ['cornell.edu'] }, principal: { verifiedEmail: email } }; return me; };
const page = async (query: Record<string, string> = {}) => renderToStaticMarkup(await (await import('./page')).default({ searchParams: Promise.resolve(query) }));
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const went = async (run: Promise<unknown>) => run.then(() => '', (error: Error) => error.message);

it('shows a signed-out visitor a way to sign in, and no box', async () => {
  const html = await page({ said: 'approved', link: LINK, club: 'Ski Club' });
  expect(html).toContain('Sign in with your school email');
  expect(html).not.toContain('<input');
  expect(html).not.toContain('It is yours');
});

it('shows each answer in its own card', async () => {
  await signIn();
  expect(await page()).toContain('name="link"');
  expect(await page({ said: 'approved', link: LINK, club: 'Ski Club' })).toContain('It is yours');
  const unlisted = await page({ said: 'unlisted', link: LINK, club: 'Ski Club' });
  expect(unlisted).toContain('Not on the list'); expect(unlisted).toContain('Send for review'); expect(unlisted).toContain(`${LINK}officers/`);
  expect(await page({ said: 'sent', link: LINK })).toContain('Being checked');
  expect(await page({ said: 'refused', link: LINK })).toContain('Turned down');
  expect(await page({ said: 'unreadable', link: LINK })).toContain('That page did not open');
  expect(await page({ said: 'bad' })).toContain('Not a club link');
});

it('never shows back a link that is not a club page', async () => {
  await signIn();
  const html = await page({ said: 'unlisted', link: 'https://evil.test/x', club: 'Ski Club' });
  expect(html).not.toContain('evil.test');
  expect(html).not.toContain('Send for review');
});

it('lists the clubs a person has claimed, with where each stands', async () => {
  const me = await signIn();
  await t.db.query(`insert into campus_club_claim(person_id,club_url,club_name,role,state,how) values($1,$2,'Ski Club','Treasurer','approved','officer list')`, [me.id, LINK]);
  const html = await page();
  expect(html).toContain('Your clubs'); expect(html).toContain('Ski Club'); expect(html).toContain('Treasurer'); expect(html).toContain('Yours');
});

it('sends a signed-out press to sign in, and checks nothing', async () => {
  const { claimClubAction } = await import('./actions');
  expect(await went(claimClubAction(form({ link: LINK })))).toBe('REDIRECT /sign-in?redirect_url=%2Forganizers%2Fclaim');
  expect(state.claimed).toEqual([]);
});

it('counts an email as the school’s only at one of the campus’s domains', async () => {
  const { claimClubAction } = await import('./actions');
  for (const email of ['Ana@Cornell.edu', 'ana@cs.cornell.edu', 'ana@notcornell.edu', 'ana@cornell.edu.evil.test', null]) { await signIn(email); await went(claimClubAction(form({ link: LINK }))); }
  expect(state.claimed.map(who => (who as { schoolEmail: boolean }).schoolEmail)).toEqual([true, true, false, false, false]);
});

it('lets only the admin decide a claim', async () => {
  const { decideClubClaimAction } = await import('@/app/c/admin/actions');
  const asking = await makePerson(t.db, 'Jules Martin');
  const html = '<h1 class="header-cg--h2">Ski Club</h1>', deps = { lookup: async () => ['93.184.216.34'], fetch: (async () => new Response(html, { headers: { 'content-type': 'text/html' } })) as typeof fetch };
  await askClubReview(t.db, { personId: asking.id, email: null, schoolEmail: false }, LINK, '', deps);
  const [{ id }] = await clubClaims(t.db), press = () => went(decideClubClaimAction(form({ campus: 'cornell', claim: id, to: 'approved' })));
  expect(await press()).toBe('REDIRECT /');
  await signIn();
  expect(await press()).toBe('REDIRECT /');
  expect((await clubClaims(t.db))[0].state).toBe('waiting');
  await signIn('ana@cornell.edu', true);
  expect(await press()).toContain('Approved');
  expect((await clubClaims(t.db))[0]).toMatchObject({ state: 'approved', how: 'admin' });
});
