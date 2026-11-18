import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import type { Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { DoorSignIn } from '@/components/campus/door-sign-in';
import { listCampuses } from '@/lib/campus/listings';
import { addHandListing } from '@/lib/campus/manage';
import { DoorPage, FrontDoor } from './door';
import { addEventAction, saveRewardAction, setHiddenAction } from './c/admin/actions';
import { GET as readCampusFeeds } from './api/cron/campus-feeds/route';

// Specs: openspec/changes/loop-campus-rewards/specs/campus-sign-in, admin-gate, campus-listings (the admin page, the hourly read).
// The sign-in form itself is Clerk's. Here it is one email field, which is all the school menu reads from it.
vi.mock('@clerk/nextjs', () => ({ SignIn: () => <input name="identifier" aria-label="Email" /> }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

const sentTo = (path: string) => expect.objectContaining({ digest: expect.stringContaining(`;${path};`) });
const drawn = async (node: Promise<React.ReactElement>) => { const element = await node as React.ReactElement<{ children: React.ReactElement<object, (props: object) => Promise<React.ReactElement>> }>, inner = element.props.children; return typeof inner.type === 'function' ? inner.type(inner.props) : inner; };
const signedIn = async (name: string, email: string, subject = `user_${name.toLowerCase()}`) => ({ personId: (await makePerson(t.db, name)).id, issuer: 'https://issuer.test', subject, verifiedEmail: email }) as Principal;

describe('the door', () => {
  it('signed out, shows the pitch, a few of this week\'s events with no people, and the sign-in card', async () => {
    const [cornell] = (await listCampuses(t.db)).filter(campus => campus.slug === 'cornell');
    await addHandListing(t.db, { campusId: cornell.id, title: 'Blitz night', host: 'Chess Club', startsAt: new Date(Date.now() + 3 * 3600000).toISOString() });
    render(await drawn(FrontDoor()));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Go together. Get more for it.');
    expect(screen.getByText('Blitz night')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'School' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Sign-in is not configured');
  });
  it('signed in, goes on to the person\'s own school; the admin from no school to the first campus', async () => {
    await expect(withPortalTestSession(await signedIn('Noor', 'noor@stern.nyu.edu'), () => FrontDoor())).rejects.toEqual(sentTo('/c/nyu'));
    vi.stubEnv('LOOP_ADMIN', 'user_fay');
    await expect(withPortalTestSession(await signedIn('Fay', 'fay@gmail.com'), () => FrontDoor())).rejects.toEqual(sentTo('/c/cuny'));
  });
  it('signed in from no school, is told which schools Loop is at', async () => {
    const omar = await signedIn('Omar', 'omar@gmail.com');
    render(await withPortalTestSession(omar, async () => drawn(FrontDoor())));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Loop is at CUNY, Columbia, Cornell and NYU for now.');
    expect(screen.queryByRole('combobox', { name: 'School' })).toBeNull();
  });
  it('/sign-in is the same door', async () => {
    render(await DoorPage({ routing: 'path' }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Sign in at /);
  });
});

describe('the school menu on the sign-in card', () => {
  const schools = [{ slug: 'cornell', name: 'Cornell', domains: ['cornell.edu'] }, { slug: 'nyu', name: 'NYU', domains: ['nyu.edu'] }];
  const type = (value: string) => fireEvent.input(screen.getByRole('textbox', { name: 'Email' }), { target: { value } });
  it('follows the typed email, subdomains included, and says so', () => {
    render(<DoorSignIn schools={schools} routing="hash" configured />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sign in at Cornell');
    type('name@stern.nyu.edu');
    expect(screen.getByRole('combobox', { name: 'School' })).toHaveValue('nyu');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sign in at NYU');
    expect(screen.getByText('stern.nyu.edu is NYU. Switched for you.')).toBeInTheDocument();
    expect(screen.getByText(/Use your NYU email \(@nyu.edu\)/)).toBeInTheDocument();
  });
  it('says where Loop is for an address from no school, and stays quiet until there is an address', () => {
    render(<DoorSignIn schools={schools} routing="hash" configured />);
    type('some');
    expect(screen.queryByText(/for now/)).toBeNull();
    type('someone@gmail.com');
    expect(screen.getByText('Loop is at Cornell, NYU for now. Use your school email.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'School' })).toHaveValue('cornell');
  });
  it('can be set by hand', () => {
    render(<DoorSignIn schools={schools} routing="path" configured />);
    fireEvent.change(screen.getByRole('combobox', { name: 'School' }), { target: { value: 'nyu' } });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sign in at NYU');
  });
});

describe('the admin actions', () => {
  const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [name, value] of Object.entries(fields)) data.set(name, value); return data; };
  it('refuse a signed-out visitor and a signed-in person who is not the admin, and change nothing', async () => {
    const sam = await signedIn('Sam', 'sam@cornell.edu');
    const event = form({ campus: 'cornell', title: 'Free pizza', starts: '2099-01-01T18:00' }), reward = form({ campus: 'cornell', giver: 'Bao House', kind: 'building', text0: 'Free everything', rule: 'outings', ruleCount: '1' });
    for (const as of [<T,>(run: () => T) => run(), <T,>(run: () => T) => withPortalTestSession(sam, run)]) {
      await expect(as(() => addEventAction(event))).rejects.toEqual(sentTo('/'));
      await expect(as(() => saveRewardAction(reward))).rejects.toEqual(sentTo('/'));
      await expect(as(() => setHiddenAction(form({ campus: 'cornell', listing: sam.personId, hidden: 'true' })))).rejects.toEqual(sentTo('/'));
    }
    expect((await t.db.query('select 1 from campus_listing')).rows).toHaveLength(0);
    expect((await t.db.query('select 1 from campus_reward')).rows).toHaveLength(0);
  });
  it('work for the admin', async () => {
    vi.stubEnv('LOOP_ADMIN', 'user_fay');
    const fay = await signedIn('Fay', 'fay@cornell.edu');
    const soon = new Date(Date.now() + 26 * 3600000).toISOString().slice(0, 16);
    await expect(withPortalTestSession(fay, () => addEventAction(form({ campus: 'cornell', title: 'Free pizza', starts: soon })))).rejects.toMatchObject({ digest: expect.stringContaining('/c/admin?campus=cornell') });
    expect((await t.db.query<{ title: string }>('select title from campus_listing')).rows).toEqual([{ title: 'Free pizza' }]);
  });
});

describe('the hourly feed read', () => {
  const call = (authorization?: string) => readCampusFeeds(new Request('https://loop.test/api/cron/campus-feeds', { headers: authorization ? { authorization } : {} }));
  it('is refused without the cron secret, with a wrong one, and when none is set', async () => {
    expect((await call('Bearer anything')).status).toBe(401);
    vi.stubEnv('CRON_SECRET', 'right-secret');
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong-secret')).status).toBe(401);
  });
  it('reads the feeds with it', async () => {
    vi.stubEnv('CRON_SECRET', 'right-secret');
    const response = await call('Bearer right-secret');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ failed: 0 });
  });
});
