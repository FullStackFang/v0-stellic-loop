import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { campusDeals } from '@/lib/campus/deals';
import { findCampus, type Campus } from '@/lib/campus/listings';
import { dealAction } from './actions';
import CampusAdminPage from './page';

// Spec: openspec/changes/campus-deals/specs/campus-deals, "The admin enters a deal once" and "Hiding a deal takes it off at once".
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../on-you', () => ({ OnYou: () => null, startOnYou: () => {} }));
vi.mock('@/lib/campus/linkedin-account', () => ({ linkedinAccount: async () => null }));
vi.mock('next/navigation', async original => ({ ...(await original<typeof import('next/navigation')>()), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useParams: () => ({}), usePathname: () => '/c/admin' }));

let t: TestDb, tech: Campus, admin: Principal, place: string;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => {
  await t.reset(); await t.db.query('delete from campus_deal');
  tech = (await findCampus(t.db, 'cornell-tech'))!;
  place = (await t.db.query<{ id: string }>("insert into campus_place(campus_id,name,lat,lon) values($1,'Nisi Bistro',40.76168,-73.94994) on conflict(campus_id,lower(name)) do update set lat=excluded.lat returning id", [tech.id])).rows[0].id;
  const row = await makePerson(t.db, 'Ana Lopez');
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  admin = (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: 'ana@cornell.edu' })))!;
  vi.stubEnv('LOOP_ADMIN', 'ana@cornell.edu');
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

function form(over: Record<string, string | string[]> = {}) {
  const data = new FormData(), fields: Record<string, string | string[]> = { campus: 'cornell-tech', tab: 'deals', place, title: 'Drinks at Nisi Bistro', line: '$2 off every drink', size: '2',
    day: ['0', '1', '2', '3', '4', '5', '6'], from: '17:00', until: '19:00', note: 'their daily happy hour, Roosevelt Islander Aug 2026', step: 'save', ...over };
  for (const [key, value] of Object.entries(fields)) for (const each of [value].flat()) data.append(key, each);
  return data;
}
const act = (data: FormData) => withPortalTestSession(admin, () => dealAction(data));

it('saves a deal, refuses the cases the spec names, and hides it', async () => {
  expect(await act(form())).toMatch(/^Saved\./);
  expect(await act(form({ day: [] }))).toBe('Not saved. Pick at least one day.');
  expect(await act(form({ from: '19:00', until: '17:00' }))).toBe('Not saved. The until time must be after the from time.');
  expect(await act(form({ place: '' }))).toBe('Not saved. Pick a place on this campus.');
  const [deal] = await campusDeals(t.db, tech.id);
  expect(deal).toMatchObject({ title: 'Drinks at Nisi Bistro', headCount: 2, days: [0, 1, 2, 3, 4, 5, 6], from: '17:00', until: '19:00', hidden: false });
  expect(await act(form({ deal: deal.id, step: 'hide' }))).toMatch(/^Hidden\./);
  expect((await campusDeals(t.db, tech.id))[0].hidden).toBe(true);
});

it('lists the deals with place, line, size, days, hours, the note and a Hidden pill', async () => {
  await act(form());
  const [deal] = await campusDeals(t.db, tech.id);
  await act(form({ deal: deal.id, step: 'hide' }));
  render(await withPortalTestSession(admin, () => CampusAdminPage({ searchParams: Promise.resolve({ campus: 'cornell-tech', tab: 'deals' }) })));
  const row = within(screen.getByText('Drinks at Nisi Bistro: $2 off every drink').closest('li')!);
  expect(row.getByText('Nisi Bistro · 2+ · Every day · 5pm–7pm')).toBeTruthy();
  expect(row.getByText('their daily happy hour, Roosevelt Islander Aug 2026')).toBeTruthy();
  expect(row.getByText('Hidden')).toBeTruthy();
  expect(row.getByRole('button', { name: 'Show' })).toBeTruthy();
  expect(screen.getAllByRole('group', { name: 'Days', hidden: true }).length).toBeGreaterThan(0);
});
