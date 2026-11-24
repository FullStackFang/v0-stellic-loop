import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { findRecord } from '@/lib/campus/record';
import { recordAction } from './actions';
import CampusAdminPage from './page';

// Spec: openspec/changes/campus-venue-record/specs/venue-record, "Opened by a private link unless made public".
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../on-you', () => ({ OnYou: () => null, startOnYou: () => {} }));
vi.mock('@/lib/campus/linkedin-account', () => ({ linkedinAccount: async () => null }));
vi.mock('next/navigation', async original => ({ ...(await original<typeof import('next/navigation')>()), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useParams: () => ({}), usePathname: () => '/c/admin' }));

let t: TestDb, admin: Principal, other: Principal, place: string;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
async function signedIn(name: string, email: string) {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
beforeEach(async () => {
  await t.reset(); await t.db.query('delete from campus_place');
  place = (await t.db.query<{ id: string }>("insert into campus_place(campus_id,name,other_names,lat,lon) values((select id from campus where slug='cornell'),'Nisi Bistro','{Nisi}',42.44,-76.48) returning id")).rows[0].id;
  admin = await signedIn('Ana Lopez', 'ana@cornell.edu');
  other = await signedIn('Dev Shah', 'dev@cornell.edu');
  vi.stubEnv('LOOP_ADMIN', 'ana@cornell.edu');
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

function form(step: string) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ campus: 'cornell', tab: 'places', place, step })) data.set(key, value);
  return data;
}
const act = (who: Principal, step: string) => withPortalTestSession(who, () => recordAction(form(step)));
const keyOf = (path?: string) => new URL(path!, 'https://x.test').searchParams.get('k');

it('copies a link that makes its key once, and a new link stops the old one', async () => {
  const first = await act(admin, 'copy');
  expect(first.said).toBe('Record link for Nisi Bistro.');
  expect(first.path).toMatch(/^\/places\/cornell\/nisi\/record\?k=[A-Za-z0-9_-]{16,64}$/);
  expect((await act(admin, 'copy')).path).toBe(first.path);
  const renewed = await act(admin, 'renew');
  expect(renewed.said).toMatch(/^New link for Nisi Bistro\./);
  expect(keyOf(renewed.path)).not.toBe(keyOf(first.path));
  expect(await findRecord(t.db, 'cornell', 'nisi', keyOf(first.path))).toBeNull();
  expect(await findRecord(t.db, 'cornell', 'nisi', keyOf(renewed.path))).not.toBeNull();
});

it('switches the record public and back', async () => {
  expect((await act(admin, 'public')).said).toMatch(/public/);
  expect(await findRecord(t.db, 'cornell', 'nisi', null)).not.toBeNull();
  expect((await act(admin, 'private')).said).toMatch(/private/);
  expect(await findRecord(t.db, 'cornell', 'nisi', null)).toBeNull();
});

it('refuses anyone who is not the admin', async () => {
  for (const step of ['copy', 'renew', 'public']) await expect(act(other, step)).rejects.toThrow(/NEXT_REDIRECT/);
  const { rows: [row] } = await t.db.query<{ key: string | null; public: boolean }>('select record_token as key,record_public as public from campus_place where id=$1', [place]);
  expect(row).toEqual({ key: null, public: false });
});

it('shows the record controls on each place of the Places tab', async () => {
  await act(admin, 'public');
  render(await withPortalTestSession(admin, () => CampusAdminPage({ searchParams: Promise.resolve({ campus: 'cornell', tab: 'places' }) })));
  const row = within(screen.getByText('Nisi Bistro', { selector: 'b' }).closest('li')!);
  expect(row.getByRole('button', { name: 'Copy record link' })).toBeTruthy();
  expect(row.getByRole('button', { name: 'New link' })).toBeTruthy();
  expect(row.getByRole('button', { name: "Nisi Bistro's record is public" }).getAttribute('aria-pressed')).toBe('true');
});
