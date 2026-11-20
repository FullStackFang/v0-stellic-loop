import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { animal } from '@/lib/campus/animals';
import type { Account } from '@/lib/campus/stats';
import { Activity, People } from './stats';

// The admin's Activity and People sections, drawn over a real database. The sign-in provider is stood in for.
const clerk = vi.hoisted(() => ({ all: [] as unknown[] }));
vi.mock('@/lib/campus/stats', async original => ({ ...(await original<typeof import('@/lib/campus/stats')>()), accounts: vi.fn(async () => clerk.all) }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); }); afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('truncate site_open'); vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', `pk_test_${Buffer.from('clerk.example.com$').toString('base64')}`); vi.stubEnv('LOOP_AUTH_ISSUER', ''); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

const NOW = new Date('2026-11-20T18:00:00Z'), TZ = 'America/New_York', top = (beside?: React.ReactNode) => <div className="cs-adm-top"><h1>Section</h1>{beside}</div>;
const account = (subject: string, over: Partial<Account> = {}): Account => ({ subject, name: subject, email: `${subject}@cornell.edu`, photo: 'https://img.example/photo.png', ways: ['google'], joined: Date.parse('2026-11-12T12:00:00Z'), lastSignIn: Date.parse('2026-11-20T17:30:00Z'), lastActive: Date.parse('2026-11-20T00:00:00Z'), ...over });
const signedUp = async (subject: string) => { const { id } = await makePerson(t.db, subject); await t.db.query('insert into emba_identity(issuer,subject,person_id,verified_at) values($1,$2,$3,now())', ['https://clerk.example.com', subject, id]); return id; };
const tile = (name: string | RegExp) => within(screen.getByRole('heading', { name }).parentElement!);

describe('Activity', () => {
  it('shows the numbers for the time picked, with a link to each other time', async () => {
    const priya = await signedUp('priya'), marcus = await signedUp('marcus');
    clerk.all = [account('priya'), account('marcus', { ways: ['email', 'linkedin'], lastActive: Date.parse('2026-10-01T00:00:00Z') }), account('old', { joined: Date.parse('2026-09-01T00:00:00Z'), lastActive: null, lastSignIn: null })];
    await t.db.query(`insert into site_open(person_id,area,opened_at) values($1,'This week','2026-11-20T15:00:00Z'),($1,'Groups','2026-11-20T15:05:00Z'),($2,'This week','2026-11-20T16:00:00Z'),(null,'Front door','2026-11-20T16:30:00Z'),($1,'This week','2026-11-19T16:00:00Z')`, [priya, marcus]);
    await t.db.query(`insert into campus_subscribe_ask(person_id,email,plan,place,asked_at) values($1,'p@cornell.edu','ink','own animal','2026-11-19T12:00:00Z')`, [priya]);
    render(await Activity({ tz: TZ, span: '7', top, href: to => `/c/admin?tab=activity&days=${to}`, now: NOW }));
    expect(tile('People signed up').getByText('3')).toBeTruthy(); expect(tile('People signed up').getByText('+0')).toBeTruthy();
    expect(tile('On the site today').getByText('2')).toBeTruthy(); expect(tile('On the site today').getByText('1')).toBeTruthy();
    expect(tile('Active, this time').getByText('1')).toBeTruthy(); expect(tile('Active, this time').getByText('33%')).toBeTruthy();
    expect(tile('Pages opened').getByText('5')).toBeTruthy();
    expect(screen.getByRole('img', { name: /People on the site each day, Nov 14 to today\. The most in a day: 2\./ })).toBeTruthy();
    const where = tile(/^Where people go/).getAllByRole('listitem').map(each => each.textContent);
    expect(where).toEqual(['This week3', 'Front door1', 'Groups1']);
    expect(tile(/^What people do/).getAllByRole('listitem')[0].textContent).toBe('Pressed Subscribe1');
    expect(tile('How they can sign in').getAllByRole('listitem').map(each => each.textContent)).toEqual(['Google267%', 'Email133%', 'LinkedIn133%']);
    expect(screen.getByRole('link', { name: '7 days' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('link', { name: 'All time' }).getAttribute('href')).toBe('/c/admin?tab=activity&days=all');
  });
  it('says so when nothing has been counted yet', async () => {
    clerk.all = [];
    render(await Activity({ tz: TZ, span: '30', top, href: () => '#', now: NOW }));
    expect(screen.getByText(/Nothing counted yet\. Pages opened are counted from the day/)).toBeTruthy();
    expect(screen.getByText('No accounts yet.')).toBeTruthy();
  });
});

describe('People', () => {
  it('lists every account, most recently signed in first, with what Loopd knows of each', async () => {
    const priya = await signedUp('priya');
    await t.db.query(`insert into campus_person(person_id,campus_id) select $1,id from campus where slug='cornell'`, [priya]);
    await t.db.query('insert into campus_face(person_id,face) values($1,4)', [priya]);
    await t.db.query(`insert into campus_ink_plus(person_id,email) values($1,'p@cornell.edu')`, [priya]);
    await t.db.query(`insert into site_open(person_id,area,opened_at) values($1,'This week','2026-11-20T15:00:00Z'),($1,'This week','2026-11-18T15:00:00Z')`, [priya]);
    clerk.all = [account('priya', { name: 'Priya Raman' }), account('stranger', { name: '', ways: ['email'], lastSignIn: Date.parse('2026-11-14T12:00:00Z') })];
    const { container } = render(await People({ tz: TZ, way: null, shown: 50, top, href: (way, n) => `/c/admin?tab=people${way ? `&way=${way}` : ''}${n ? `&n=${n}` : ''}`, now: NOW }));
    const [first, second] = screen.getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell').map(cell => cell.textContent));
    expect(first).toEqual(['Priya Ramanpriya@cornell.edu', 'Cornell', 'Google', 'Nov 12', '2 days', '30 min ago', 'Ink+']);
    expect(second).toEqual(['No namestranger@cornell.edu', 'Not seen yet', 'Email', 'Nov 12', '0 days', '6 days ago', '']);
    expect([...container.querySelectorAll('img')].map(img => img.getAttribute('src'))).toEqual([animal(4), 'https://img.example/photo.png']);
    expect(screen.getByRole('link', { name: 'Everyone2' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('link', { name: 'Email1' }).getAttribute('href')).toBe('/c/admin?tab=people&way=email');
  });
  it('shows only one way of signing in, and offers more lines when there are more', async () => {
    clerk.all = [account('a'), account('b', { ways: ['email'] }), account('c'), account('d')];
    render(await People({ tz: TZ, way: 'google', shown: 2, top, href: (way, n) => `/c/admin?tab=people&way=${way}&n=${n ?? ''}`, now: NOW }));
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('showing 2 of 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Show 50 more' }).getAttribute('href')).toBe('/c/admin?tab=people&way=google&n=52');
  });
});
