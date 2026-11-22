import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import type { Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { DoorSignIn } from '@/components/campus/door-sign-in';
import { listCampuses } from '@/lib/campus/listings';
import { addHandListing } from '@/lib/campus/manage';
import { campusViewer, lookingAt } from '@/lib/campus/session';
import { DoorPage, FrontDoor, pitchTickets } from './door';
import { addEventAction, joinTagAction, saveRewardAction, setHiddenAction, setTagKindAction, splitTagAction } from './c/admin/actions';
import { GET as readCampusFeeds } from './api/cron/campus-feeds/route';

// Specs: openspec/changes/loop-campus-rewards/specs/campus-sign-in, admin-gate, campus-listings (the admin page, the hourly read).
// The sign-in form itself is Clerk's. Here it is one email field, which is all the school menu reads from it.
vi.mock('@clerk/nextjs', () => ({ SignIn: () => <input name="identifier" aria-label="Email" /> }));
// Next's cache needs a running server. In its place: a stand-in that keeps nothing, unless a test turns keeping on, and
// notes what each kept function was asked to be kept for.
const kept = vi.hoisted(() => ({ on: false, values: new Map<string, unknown>(), asked: new Map<string, unknown>() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (read: () => Promise<unknown>, keys: string[], options: unknown) => {
    const key = keys.join('|'); kept.asked.set(key, options);
    return () => { if (!kept.on) return read(); if (!kept.values.has(key)) kept.values.set(key, read()); return kept.values.get(key); };
  },
}));
// The foot of the door (components/campus/foot.tsx) asks for the router; redirect stays the real one.
vi.mock('next/navigation', async original => ({ ...(await original<typeof import('next/navigation')>()), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
// The campus the browser was last looking at (the cookie the campus screen leaves), or none.
const jar = vi.hoisted(() => ({ at: null as string | null }));
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ get: (name: string) => jar.at ? { name, value: jar.at } : undefined }) }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); jar.at = null; });

const sentTo = (path: string) => expect.objectContaining({ digest: expect.stringContaining(`;${path};`) });
const drawn = async (node: Promise<React.ReactElement>) => { const element = await node as React.ReactElement<{ children: React.ReactElement<object, (props: object) => Promise<React.ReactElement>> }>, inner = element.props.children; return typeof inner.type === 'function' ? inner.type(inner.props) : inner; };
const signedIn = async (name: string, email: string, subject = `user_${name.toLowerCase()}`) => ({ personId: (await makePerson(t.db, name)).id, issuer: 'https://issuer.test', subject, verifiedEmail: email }) as Principal;

describe('the door', () => {
  it('signed out, shows the pitch, a few of this week\'s events with no people, and the sign-in card', async () => {
    const [cornell] = (await listCampuses(t.db)).filter(campus => campus.slug === 'cornell');
    await addHandListing(t.db, { campusId: cornell.id, title: 'Blitz night', host: 'Chess Club', startsAt: new Date(Date.now() + 3 * 3600000).toISOString() });
    render(await drawn(FrontDoor()));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Go together at Cornell.');
    expect(screen.getByText('Blitz night')).toBeInTheDocument();
    // The foot is there too, in the colours of the school on the ticket, with the small print and no colours to pick.
    const foot = screen.getByRole('contentinfo');
    expect(foot).toHaveAttribute('data-kit', 'cornell');
    expect(within(foot).getAllByRole('link').map(link => link.textContent)).toEqual(['Loopd', 'Terms', 'Privacy']);
    expect(within(foot).queryByRole('group', { name: 'Colours' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Sign-in is not configured');
  });
  it('the ticket can be tried: two presses fill the seats and unlock the reward, and a seat can be given up', async () => {
    const [cornell] = (await listCampuses(t.db)).filter(campus => campus.slug === 'cornell');
    await addHandListing(t.db, { campusId: cornell.id, title: 'Blitz night', host: 'Chess Club', startsAt: new Date(Date.now() + 3 * 3600000).toISOString() });
    render(await drawn(FrontDoor()));
    // No reward was entered for this event, so the one shown says it is an example.
    expect(screen.getByText('For example, a group of 3 gets')).toBeInTheDocument();
    expect(screen.getByText('2 more and it unlocks')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I’m in' }));
    expect(screen.getByText('1 more and it unlocks')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bring one more' }));
    expect(screen.getByText('Unlocked')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Your seat. Give it up' }));
    expect(screen.getByText('2 more and it unlocks')).toBeInTheDocument();
  });
  it('a school with nothing on this week shows a ticket that says it is an example', async () => {
    render(await drawn(FrontDoor()));
    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I’m in' })).toBeInTheDocument();
  });
  it('signed in, goes on to the person\'s own school; the admin from no school to the default campus', async () => {
    await expect(withPortalTestSession(await signedIn('Noor', 'noor@stern.nyu.edu'), () => FrontDoor())).rejects.toEqual(sentTo('/c/nyu'));
    vi.stubEnv('LOOP_ADMIN', 'user_fay');
    await expect(withPortalTestSession(await signedIn('Fay', 'fay@gmail.com'), () => FrontDoor())).rejects.toEqual(sentTo('/c/cornell'));
  });
  it('signed in, goes back to the campus of their school they were last looking at, and to no campus they may not open', async () => {
    const sam = await signedIn('Sam', 'sam@cornell.edu');
    jar.at = 'cornell-tech';
    await expect(withPortalTestSession(sam, () => FrontDoor())).rejects.toEqual(sentTo('/c/cornell-tech'));
    expect((await withPortalTestSession(sam, () => lookingAt()))?.slug).toBe('cornell-tech');
    // Looking does not move them: New York is still not their own.
    expect((await withPortalTestSession(sam, () => campusViewer()))?.campus?.slug).toBe('cornell');
    for (const other of ['nyu', 'nowhere', '../x']) {
      jar.at = other;
      await expect(withPortalTestSession(sam, () => FrontDoor())).rejects.toEqual(sentTo('/c/cornell'));
    }
    // The admin, who has no school, goes back to wherever they were.
    vi.stubEnv('LOOP_ADMIN', 'user_fay'); jar.at = 'cornell-tech';
    await expect(withPortalTestSession(await signedIn('Fay', 'fay@gmail.com'), () => FrontDoor())).rejects.toEqual(sentTo('/c/cornell-tech'));
  });
  it('signed in from no school, is told where Loopd is and goes no further', async () => {
    render(await drawn(withPortalTestSession(await signedIn('Omar', 'omar@gmail.com'), () => FrontDoor())));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Loopd is only for schools right now. If that changes, we’ll let you know.');
  });
  it('/sign-in is the same door', async () => {
    render(await DoorPage({ routing: 'path' }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Sign in$/);
  });
  // openspec/changes/loop-lighter-pages, D4: the pitch's tickets are read once a minute, and the door still asks who is looking.
  describe('while the pitch is kept', () => {
    beforeEach(() => { kept.on = true; kept.values.clear(); });
    afterEach(() => { kept.on = false; });
    it('is kept for a minute, and a second visit shows what the first read', async () => {
      expect(kept.asked.get('door-pitch')).toEqual({ revalidate: 60 });
      const [cornell] = (await listCampuses(t.db)).filter(campus => campus.slug === 'cornell');
      await addHandListing(t.db, { campusId: cornell.id, title: 'Blitz night', host: 'Chess Club', startsAt: new Date(Date.now() + 3 * 3600000).toISOString() });
      render(await drawn(FrontDoor()));
      expect(screen.getByText('Blitz night')).toBeInTheDocument();
      cleanup();
      // Posted after the first visit: not read again until the minute is up.
      await addHandListing(t.db, { campusId: cornell.id, title: 'Board games', host: 'Games Club', startsAt: new Date(Date.now() + 2 * 3600000).toISOString() });
      render(await drawn(FrontDoor()));
      expect(screen.getByText('Blitz night')).toBeInTheDocument();
      expect(screen.queryByText('Board games')).toBeNull();
    });
    it('names no person, so it can be the same for everyone', async () => {
      const [cornell] = (await listCampuses(t.db)).filter(campus => campus.slug === 'cornell');
      await addHandListing(t.db, { campusId: cornell.id, title: 'Blitz night', host: 'Chess Club', startsAt: new Date(Date.now() + 3 * 3600000).toISOString() });
      const tickets = await pitchTickets();
      expect(Object.keys(tickets[0]).sort()).toEqual(['domains', 'event', 'name', 'reward', 'slug']);
      expect(JSON.parse(JSON.stringify(tickets))).toEqual(tickets);
    });
    it('still sends a signed-in member on to their campus', async () => {
      await drawn(FrontDoor());
      await expect(withPortalTestSession(await signedIn('Noor', 'noor@stern.nyu.edu'), () => FrontDoor())).rejects.toEqual(sentTo('/c/nyu'));
    });
  });
});

describe('the sign-in card', () => {
  afterEach(() => { delete document.documentElement.dataset.kit; localStorage.clear(); });
  const schools = [{ slug: 'cornell', name: 'Cornell', domains: ['cornell.edu'] }, { slug: 'nyu', name: 'NYU', domains: ['nyu.edu'] }];
  const type = (value: string) => fireEvent.input(screen.getByRole('textbox', { name: 'Email' }), { target: { value } });
  it('has no school menu: it spots the school in the typed email, subdomains included, says so and puts on its colours', () => {
    render(<DoorSignIn schools={schools} routing="hash" configured />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Sign in$/);
    type('name@stern.nyu.edu');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sign in at NYU');
    expect(screen.getByText('stern.nyu.edu is NYU.')).toBeInTheDocument();
    expect(screen.getByText('With your NYU email you see NYU.')).toBeInTheDocument();
    expect(document.documentElement.dataset.kit).toBe('nyu');
    type('name@cornell.edu');
    expect(document.documentElement.dataset.kit).toBe('cornell');
  });
  it('spots an email the browser filled in without a keystroke', () => {
    vi.useFakeTimers();
    try {
      render(<DoorSignIn schools={schools} routing="hash" configured />);
      (screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement).value = 'name@cornell.edu';
      act(() => { vi.advanceTimersByTime(600); });
      expect(document.documentElement.dataset.kit).toBe('cornell');
    } finally { vi.useRealTimers(); }
  });
  it('says an address is from no school and that it still signs in, and stays quiet until there is an address', () => {
    render(<DoorSignIn schools={schools} routing="hash" configured />);
    type('some');
    expect(screen.queryByText(/Not an email at/)).toBeNull();
    type('someone@gmail.com');
    expect(screen.getByText('Not an email at Cornell or NYU. You can still sign in with it.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Sign in$/);
  });
  it('goes back to the picked colours, or Loopd\'s own, when the email is at no school', () => {
    render(<DoorSignIn schools={schools} routing="hash" configured />);
    type('name@nyu.edu'); type('name@gmail.com');
    expect(document.documentElement.dataset.kit).toBe('loop');
    localStorage.setItem('loop-kit', 'columbia');
    type('name@nyu.edu'); type('name@gmail.co');
    expect(document.documentElement.dataset.kit).toBe('columbia');
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
  // Spec: openspec/changes/loop-campus-tags/specs/campus-tags ("The admin can correct kinds and groups").
  it('change the kind of a tag, join it to a group and split it out, for the admin alone', async () => {
    const [cornell] = (await listCampuses(t.db)).filter(campus => campus.slug === 'cornell');
    await t.db.query('delete from campus_tag');
    const make = async (slug: string) => (await t.db.query<{ id: string }>('insert into campus_tag(campus_id,slug) values($1,$2) returning id', [cornell.id, slug])).rows[0].id;
    const running = await make('running'), jogging = await make('jogging');
    const tags = async () => (await t.db.query('select t.slug,t.kind,l.slug as lead,t.by_hand as hand from campus_tag t left join campus_tag l on l.id=t.same_as order by t.slug')).rows;
    const kind = () => setTagKindAction(form({ campus: 'cornell', tab: 'tags', tag: jogging, kind: 'activity' })), join = () => joinTagAction(form({ campus: 'cornell', tab: 'tags', tag: jogging, into: running })), split = () => splitTagAction(form({ campus: 'cornell', tab: 'tags', tag: jogging }));
    const sam = await signedIn('Sam', 'sam@cornell.edu');
    for (const as of [<T,>(run: () => T) => run(), <T,>(run: () => T) => withPortalTestSession(sam, run)]) for (const action of [kind, join, split]) await expect(as(action)).rejects.toEqual(sentTo('/'));
    expect(await tags()).toEqual([{ slug: 'jogging', kind: null, lead: null, hand: false }, { slug: 'running', kind: null, lead: null, hand: false }]);
    vi.stubEnv('LOOP_ADMIN', 'user_fay');
    const fay = await signedIn('Fay', 'fay@cornell.edu'), back = { digest: expect.stringContaining('/c/admin?campus=cornell&tab=tags') };
    await expect(withPortalTestSession(fay, join)).rejects.toMatchObject(back);
    expect(await tags()).toEqual([{ slug: 'jogging', kind: null, lead: 'running', hand: true }, { slug: 'running', kind: null, lead: null, hand: false }]);
    await expect(withPortalTestSession(fay, kind)).rejects.toMatchObject(back);
    expect(await tags()).toEqual([{ slug: 'jogging', kind: 'activity', lead: 'running', hand: true }, { slug: 'running', kind: 'activity', lead: null, hand: true }]);
    await expect(withPortalTestSession(fay, split)).rejects.toMatchObject(back);
    expect(await tags()).toEqual([{ slug: 'jogging', kind: 'activity', lead: null, hand: true }, { slug: 'running', kind: 'activity', lead: null, hand: true }]);
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
