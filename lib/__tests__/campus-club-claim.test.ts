// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { askClubReview, claimClub, clubClaims, clubLink, decideClubClaim, myClaims, readOfficers, sameName } from '@/lib/campus/club-claim';

vi.mock('server-only', () => ({}));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });

// The markup of a CampusGroups officer page, with invented people.
const card = (name: string, role: string) => `<div id="member_card_holder_x"><table class="member_card" style="width:100%"><tr><td class="two"><img src="/p.png" /></td>
  <td width="170" class="three"><a title="Officer Profile" href="/SKI/web_login?redirect=%2fSKI%2fweb_officers"><strong><span style="display:block;" class="ecg_large_txt">${name}</span></strong></a>
  <span>Student - Undergraduate</span><span class="stud">2027</span></td><td class="other" style="vertical-align:top"><strong>${role}</strong><br /></td></tr></table></div>`;
const page = (officers: [string, string][], club = 'Cornell Ski &amp; Snowboard Club') => `<html><head><title>CampusGroups</title><style>.member_card tr {border-bottom: 1px solid #ddd;}</style></head><body>
  <h1 class="header-cg--h2"><span class="mdi mdi-account-star color-cg--officer"></span> ${club}</h1>${officers.map(([name, role]) => card(name, role)).join('')}</body></html>`;
const OFFICERS: [string, string][] = [['Ana María López', 'President'], ['Wei Chen', 'Treasurer'], ['Omar Haddad', '']];
/** A stand-in for the site: what it serves, and what was asked of it. */
const site = (html: string | null, status = 200) => { const asked: string[] = []; return { asked, deps: { lookup: async () => ['93.184.216.34'], fetch: (async (url: RequestInfo | URL) => { asked.push(String(url)); return new Response(html ?? 'gone', { status: html === null ? 404 : status, headers: { 'content-type': 'text/html' } }); }) as typeof fetch } }; };
const LINK = 'https://cornell.campusgroups.com/SKI/';
const who = async (name: string, schoolEmail = true) => ({ personId: (await makePerson(t.db, name)).id, email: 'me@cornell.edu', schoolEmail });

it('takes a club page on a CampusGroups site, however it was pasted, and nothing else', () => {
  expect(clubLink('cornell.campusgroups.com/SKI')).toEqual({ page: LINK, officers: 'https://cornell.campusgroups.com/SKI/officers/', host: 'cornell.campusgroups.com' });
  expect(clubLink('  https://Cornell.CampusGroups.com/SKI/officers/?x=1#top ')?.page).toBe(LINK);
  for (const bad of ['', 'https://cornell.campusgroups.com/', 'https://campusgroups.com.evil.test/SKI', 'https://evil.test/cornell.campusgroups.com/SKI', 'https://cornell.campusgroups.com@evil.test/SKI', 'http://169.254.169.254/SKI', 'javascript:alert(1)', 7, null])
    expect(clubLink(bad)).toBeNull();
});

it('reads the club and its officers from the page, each with their role', () => {
  expect(readOfficers(page(OFFICERS))).toEqual({ club: 'Cornell Ski & Snowboard Club', officers: [{ name: 'Ana María López', role: 'President' }, { name: 'Wei Chen', role: 'Treasurer' }, { name: 'Omar Haddad', role: null }] });
  expect(readOfficers('<html><body>Sign in</body></html>')).toEqual({ club: null, officers: [] });
});

it('counts two names as one person by their first and last word, accents and case aside', () => {
  expect(sameName('Ana María López', 'ana lopez')).toBe(true);
  expect(sameName("Sean O'Brien", 'Sean OBrien')).toBe(true);
  expect(sameName('Ana Lopez', 'Ana Lopes')).toBe(false);
  expect(sameName('Ana', 'Ana Lopez')).toBe(false);
  expect(sameName('Lopez Ana', 'Ana Lopez')).toBe(false);
});

it('gives the club at once to someone with a school email whose name is on the officer list', async () => {
  const me = await who('Ana Lopez'), cg = site(page(OFFICERS));
  expect(await claimClub(t.db, me, LINK, cg.deps)).toEqual({ state: 'approved', club: 'Cornell Ski & Snowboard Club', role: 'President', page: LINK });
  expect(cg.asked).toEqual(['https://cornell.campusgroups.com/SKI/officers/']);
  expect(await myClaims(t.db, me.personId)).toEqual([{ club: 'Cornell Ski & Snowboard Club', page: LINK, role: 'President', state: 'approved' }]);
  // The admin sees that it was automatic, and the list it was read from.
  expect(await clubClaims(t.db)).toMatchObject([{ person: 'Ana Lopez', email: 'me@cornell.edu', how: 'officer list', state: 'approved', seen: 'Ana María López (President); Wei Chen (Treasurer); Omar Haddad' }]);
  // Asking again answers from what is kept: the site is not read a second time.
  expect((await claimClub(t.db, me, 'cornell.campusgroups.com/SKI', cg.deps)).state).toBe('approved');
  expect(cg.asked).toHaveLength(1);
});

it('keeps nothing for someone whose name is not on the list, until they ask for a check', async () => {
  const me = await who('Jules Martin'), cg = site(page(OFFICERS));
  expect(await claimClub(t.db, me, LINK, cg.deps)).toEqual({ state: 'unlisted', club: 'Cornell Ski & Snowboard Club', page: LINK });
  expect(await clubClaims(t.db)).toEqual([]);
  expect(await askClubReview(t.db, me, LINK, '  I was elected\n last week ', cg.deps)).toBe(true);
  expect(await clubClaims(t.db)).toMatchObject([{ person: 'Jules Martin', state: 'waiting', how: 'admin', note: 'I was elected last week', role: null }]);
  expect(await claimClub(t.db, me, LINK, cg.deps)).toEqual({ state: 'waiting', club: 'Cornell Ski & Snowboard Club', page: LINK });
});

it('does not take a name match from someone with no school email', async () => {
  const me = await who('Wei Chen', false);
  expect((await claimClub(t.db, me, LINK, site(page(OFFICERS)).deps)).state).toBe('unlisted');
  expect(await clubClaims(t.db)).toEqual([]);
});

it('lets the admin approve a waiting claim, and take back one that was automatic', async () => {
  const listed = await who('Wei Chen'), asking = await who('Jules Martin'), cg = site(page(OFFICERS));
  await claimClub(t.db, listed, LINK, cg.deps); await askClubReview(t.db, asking, LINK, '', cg.deps);
  const all = await clubClaims(t.db), id = (name: string) => all.find(each => each.person === name)!.id;
  expect(all.map(each => each.person)).toEqual(['Jules Martin', 'Wei Chen']);
  expect(await decideClubClaim(t.db, id('Jules Martin'), 'approved')).toBe(true);
  expect(await decideClubClaim(t.db, id('Wei Chen'), 'refused')).toBe(true);
  expect((await myClaims(t.db, asking.personId))[0].state).toBe('approved');
  expect((await myClaims(t.db, listed.personId))[0].state).toBe('refused');
  // What the admin turned down is not handed back by another look at the list.
  expect((await claimClub(t.db, listed, LINK, cg.deps)).state).toBe('refused');
  expect(await decideClubClaim(t.db, '00000000-0000-4000-8000-000000000000', 'approved')).toBe(false);
});

it('says so when the page cannot be read, or is not a club, or the link is not one', async () => {
  const me = await who('Ana Lopez');
  expect(await claimClub(t.db, me, LINK, site(null).deps)).toEqual({ state: 'unreadable', page: LINK });
  expect(await claimClub(t.db, me, LINK, site('<html><body>Sign in</body></html>').deps)).toEqual({ state: 'unreadable', page: LINK });
  expect(await claimClub(t.db, me, 'https://example.com/SKI', site(page(OFFICERS)).deps)).toEqual({ state: 'bad link' });
  expect(await askClubReview(t.db, me, LINK, 'x', site(null).deps)).toBe(false);
  expect(await clubClaims(t.db)).toEqual([]);
});
