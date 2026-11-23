import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { CampusBar } from '@/components/campus/screen';
import { findCampus } from '@/lib/campus/listings';
import { addHandListing } from '@/lib/campus/manage';
import { campusScreen } from '@/lib/campus/screen';
import { campusViewer } from '@/lib/campus/session';
import { imIn, joinByToken, checkIn } from '@/lib/campus/outings';
import { pickFace } from '@/lib/campus/people';
import { siteBar } from '@/app/c/site-bar';
import GroupsLayout from './layout';

// openspec loop-faster-signed-in-pages, task 3.5: the bar on a groups page and on a campus page that draws no week reads the
// account card on its own (lib/campus/screen.ts, barScreen). Signed in, the card must be the one the week page draws.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// The counters load by themselves (app/c/on-you.test.tsx); drawn here they never settle.
vi.mock('@/app/c/on-you', () => ({ OnYou: () => null, startOnYou: () => {} }));
vi.mock('next/navigation', async original => ({ ...await original<typeof import('next/navigation')>(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useParams: () => ({}), usePathname: () => '/groups', useSearchParams: () => new URLSearchParams() }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => { cleanup(); });

async function person(name: string, email: string): Promise<Principal> {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
/** The avatar button and the top of the open card: face, name, level, outings, and the plan's pill. */
function card() {
  fireEvent.click(screen.getByRole('button', { name: /Show your level/ }));
  const dialog = screen.getByRole('dialog', { name: 'Your level' });
  const html = { avatar: screen.getByRole('button', { name: /Show your level/ }).innerHTML, top: dialog.querySelector('.cs-lvl-top')!.innerHTML, plan: dialog.querySelector('.cs-lvl-foot > :first-child')?.outerHTML ?? null };
  cleanup();
  return html;
}

it('a groups page and a campus page draw the same account card as the week page, signed in', async () => {
  const ana = await person('Ana Lopez', 'ana@cornell.edu'), ben = await person('Ben Okafor', 'ben@cornell.edu');
  // Ana is in a group (so the groups site opens to her), has picked an animal, and has two outings that count.
  const { rows: [org] } = await t.db.query<{ id: string }>("insert into emba_organization(name) values('Team 4') returning id");
  const { rows: [loop] } = await t.db.query<{ id: string }>("insert into emba_loop(org_id,path) values($1,'root') returning id", [org.id]);
  for (const who of [ana, ben]) {
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [org.id, who.personId]);
    await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [org.id, loop.id, who.personId]);
  }
  const viewer = (await withPortalTestSession(ana, () => campusViewer()))!;
  expect(viewer.campus?.slug).toBe('cornell');
  await pickFace(t.db, ana.personId, 3);
  const cornell = (await findCampus(t.db, 'cornell'))!;
  for (const ago of [48, 24]) {
    const at = new Date(Date.now() - ago * 3600000), listing = (await addHandListing(t.db, { campusId: cornell.id, title: `Run ${ago}`, startsAt: at.toISOString() })).id;
    const { token } = await imIn(t.db, ana.personId, listing, at); await joinByToken(t.db, ben.personId, token, at);
    await checkIn(t.db, ana.personId, listing, at); await checkIn(t.db, ben.personId, listing, at);
  }

  // The week page's card, from the whole campus screen.
  const week = await campusScreen(t.db, cornell, { personId: ana.personId, admin: false, groups: [] }, { photos: async () => ({}) });
  render(<CampusBar screen={week} signInHref="/sign-in" />);
  const expected = card();
  expect(expected.top).toContain('Ana Lopez');
  expect(expected.top).toContain('2 of 15 outings');

  // A groups page: the layout, signed in.
  render(await withPortalTestSession(ana, () => GroupsLayout({ children: <p>The page</p> })));
  expect(screen.getByText('The page')).toBeInTheDocument();
  expect(card()).toEqual(expected);

  // A campus page that draws no week (Ink, Doodles, organizers).
  const { bar } = await withPortalTestSession(ana, async () => siteBar({ campus: cornell, viewer: (await campusViewer())!, back: '/c/ink', on: 'ink' }));
  render(<>{bar}</>);
  expect(card()).toEqual(expected);
});
