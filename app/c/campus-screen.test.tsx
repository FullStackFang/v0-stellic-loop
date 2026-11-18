import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { CampusScreen } from '@/components/campus/screen';
import { findCampus, type Campus } from '@/lib/campus/listings';
import { addHandListing } from '@/lib/campus/manage';
import { checkIn, imIn, joinByToken, outingByToken } from '@/lib/campus/outings';
import { postPlan } from '@/lib/campus/plans';
import { saveReward } from '@/lib/campus/rewards';
import { campusScreen, type ScreenViewer, type ShareLink } from '@/lib/campus/screen';
import { checkInAction, imInAction, joinAction, useRewardAction as markUsed } from './actions';
import CampusPage from './[campus]/page';
import PostPlanPage from './[campus]/post/page';
import CampusAdminPage from './admin/page';
import OutingLinkPage from '../o/[token]/page';

// Specs: openspec/changes/loop-campus-rewards/specs/campus-screen, outings ("Who sees whom"), member-levels, campus-search.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let t: TestDb, cornell: Campus;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from campus_place'); cornell = (await findCampus(t.db, 'cornell'))!; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

const soon = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
async function person(name: string, email = `${name.split(' ')[0].toLowerCase()}@cornell.edu`): Promise<Principal> {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
async function group(name: string, ...people: Principal[]) {
  const { rows: [org] } = await t.db.query<{ id: string }>('insert into emba_organization(name) values($1) returning id', [name]);
  for (const each of people) await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [org.id, each.personId]);
}
const event = async (title: string, over: { host?: string; place?: string; about?: string; hours?: number } = {}) => (await addHandListing(t.db, { campusId: cornell.id, title, startsAt: soon(over.hours ?? 3), host: over.host, place: over.place, about: over.about })).id;
const noPhotos = async () => ({});
const show = async (viewer: ScreenViewer | null, over: { link?: ShareLink; photos?: Record<string, string> } = {}) => {
  const model = await campusScreen(t.db, cornell, viewer, { link: over.link, photos: over.photos ? async () => over.photos! : noPhotos });
  return { model, ...render(<CampusScreen screen={model} signInHref="/sign-in?redirect_url=%2Fc%2Fcornell" openId={over.link?.listingId} />) };
};
const as = (who: Principal, admin = false): ScreenViewer => ({ personId: who.personId, admin });

/** Ana knows Ben (Team 4) and not Zebediah. Both are going to Blitz night, in outings of their own. */
async function world() {
  const [ana, ben, zeb] = [await person('Ana Lopez'), await person('Ben Okafor'), await person('Zebediah Quill')];
  await group('Team 4', ana, ben);
  const blitz = await event('Blitz night', { host: 'Chess Club', place: 'Willard Straight Hall, Room 414', about: 'Five-minute games, all levels.' });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Chess Club', kind: 'group', hostName: 'Chess Club', headCount: 3, texts: ['Skip the door', 'A board held for you', 'A seat at the final'] });
  const bens = await imIn(t.db, ben.personId, blitz), zebs = await imIn(t.db, zeb.personId, blitz);
  return { ana, ben, zeb, blitz, bens, zebs };
}

describe('signed out', () => {
  it('shows the week as tickets with counts and no names, and "Sign in" in the bar', async () => {
    const { ana, ben } = await world();
    await postPlan(t.db, ben.personId, cornell, { title: 'Sunset run', starts: new Date(Date.now() + 26 * 3600000).toISOString().slice(0, 16) });
    const { container } = await show(null);
    expect(screen.getByRole('heading', { name: 'Blitz night' })).toBeInTheDocument();
    expect(screen.getByText('Skip the door')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Sign in' })[0]).toHaveAttribute('href', '/sign-in?redirect_url=%2Fc%2Fcornell');
    // Posting needs sign-in: the link leads to the form, which sends a signed-out visitor to sign in and back.
    expect(screen.getByRole('link', { name: 'Post a plan' })).toHaveAttribute('href', '/c/cornell/post');
    // Nobody is named: not the people going, not who posted a plan.
    for (const name of ['Ben', 'Okafor', 'Zebediah', 'Ana', 'Posted by']) expect(container.innerHTML).not.toContain(name);
    expect(container.innerHTML).not.toContain(ana.personId);
    // "I'm in" sends a signed-out visitor to sign in and back.
    expect(screen.getAllByRole('link', { name: "I'm in" })[0]).toHaveAttribute('href', '/sign-in?redirect_url=%2Fc%2Fcornell');
    expect(await imInAction((await world()).blitz)).toMatchObject({ ok: false, signIn: true });
  });
});

describe('who sees whom', () => {
  it('shows the first name of someone the viewer knows, and never a stranger', async () => {
    const { ana, zeb } = await world();
    const { container } = await show(as(ana));
    // Ben is in a seat, by first name, as an initial because he has no photo. Zebediah is a count and a filled seat.
    expect(screen.getByRole('img', { name: 'Ben' })).toHaveTextContent('B');
    for (const hidden of ['Zebediah', 'Quill', 'Okafor', zeb.personId]) expect(container.innerHTML).not.toContain(hidden);
    expect(screen.getByText(/Group of 3/)).toBeInTheDocument();
  });
  it('shows a photo where the sign-in account has one', async () => {
    const { ana, ben } = await world();
    await show(as(ana), { photos: { [ben.personId]: 'https://img.test/ben.png' } });
    expect(screen.getByRole('img', { name: 'Ben' })).toHaveAttribute('src', 'https://img.test/ben.png');
  });
  it('a stranger in the same outing is shown, by first name only', async () => {
    const { ana, zebs } = await world();
    await joinByToken(t.db, ana.personId, zebs.token);
    const { container } = await show(as(ana));
    expect(screen.getAllByRole('img', { name: 'Zebediah' }).length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toContain('Quill');
  });
  it('names who posted a plan to signed-in visitors', async () => {
    const { ana, zeb } = await world();
    await postPlan(t.db, zeb.personId, cornell, { title: 'Sunset run', starts: new Date(Date.now() + 26 * 3600000).toISOString().slice(0, 16) });
    await show(as(ana));
    expect(screen.getByText(/Posted by Zebediah/)).toBeInTheDocument();
  });
});

describe('levels on the screen', () => {
  it('a Member sees the Member text of a reward and no text of a higher level', async () => {
    const { ana } = await world();
    const { container } = await show(as(ana));
    expect(screen.getByText('Skip the door')).toBeInTheDocument();
    for (const higher of ['A board held for you', 'A seat at the final']) expect(container.innerHTML).not.toContain(higher);
  });
  it('the badge on the avatar opens the level card, and only the admin gets "Admin"', async () => {
    const { ana } = await world();
    await show(as(ana));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ana Lopez, Member/ }));
    const card = screen.getByRole('dialog', { name: 'Your level' });
    expect(card).toHaveTextContent('Member · level 1 of 3');
    expect(card).toHaveTextContent('5 more to Regular');
    expect(within(card).queryByText('Admin')).toBeNull();
    expect(within(card).queryByRole('link', { name: 'The groups site' })).toBeNull();
    // The card also lets anyone pick whose colours the screen wears, and the pick is kept on this browser.
    const colours = within(within(card).getByRole('group', { name: 'Colours' }));
    expect(colours.getAllByRole('button').map(button => button.textContent)).toEqual(['Loop', 'Columbia', 'Cornell', 'CUNY', 'NYU']);
    fireEvent.click(colours.getByRole('button', { name: 'Columbia' }));
    expect(colours.getByRole('button', { name: 'Columbia' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.kit).toBe('columbia');
    expect(localStorage.getItem('loop-kit')).toBe('columbia');
    delete document.documentElement.dataset.kit; localStorage.clear();
    cleanup();
    await show(as(ana, true));
    fireEvent.click(screen.getByRole('button', { name: /Ana Lopez, Member/ }));
    const admin = within(screen.getByRole('navigation', { name: 'Admin' }));
    expect(admin.getByRole('link', { name: 'Run the campus' })).toHaveAttribute('href', '/c/admin');
    expect(admin.getByRole('link', { name: 'The groups site' })).toHaveAttribute('href', '/groups');
    expect(admin.getByRole('link', { name: 'How we got here' })).toHaveAttribute('href', '/groups/archive');
  });
});

describe('the row and its panel', () => {
  it('opens details beside the ticket, one at a time, with the map only when the place is matched', async () => {
    const { ana } = await world();
    await t.db.query("insert into campus_place(campus_id,name,lat,lon) values($1,'Olin Library',42.4479,-76.4843)", [cornell.id]);
    await event('Thesis sprint', { place: 'Olin Library, Room 701', hours: 5 });
    await show(as(ana));
    fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[0]);
    expect(screen.getByText('Five-minute games, all levels.')).toBeInTheDocument();
    expect(screen.getByText(/Once 3 of you check in together/)).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();   // Willard Straight Hall is not a place Loop knows
    fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[0]);
    expect(screen.queryByText('Five-minute games, all levels.')).toBeNull();
    expect(document.querySelector('iframe')).toHaveAttribute('title', 'Map of Olin Library');
    expect(document.querySelectorAll('.cs-sheet')).toHaveLength(1);
  });
  it('"Register" on a feed event opens the panel, which does not claim the organizer was told', async () => {
    const { ana } = await world();
    const { rows: [feed] } = await t.db.query<{ id: string }>("insert into campus_feed(campus_id,source,url) values($1,'CampusGroups','https://feeds.test/x.ics') returning id", [cornell.id]);
    await t.db.query("insert into campus_listing(campus_id,origin,feed_id,feed_item_id,title,starts_at) values($1,'feed',$2,'x1','Resume drop-in',$3)", [cornell.id, feed.id, soon(4)]);
    await show(as(ana));
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByRole('button', { name: 'Register me' })).toBeInTheDocument();
    expect(screen.getByText(/CampusGroups is not told/)).toBeInTheDocument();
    await t.db.query('delete from campus_feed');
  });
  it('a share link opens that event with "Join", and joining puts the person in that outing', async () => {
    const { ana, blitz, zebs } = await world();
    const outing = (await outingByToken(t.db, zebs.token))!;
    await show(as(ana), { link: { token: zebs.token, outingId: outing.id, listingId: blitz } });
    expect(screen.getByText('You were sent a link to a group going to this.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Join' }).length).toBeGreaterThan(0);
    expect(await withPortalTestSession(ana, () => joinAction(zebs.token))).toEqual({ ok: true });
    cleanup();
    await show(as(ana));
    expect(screen.getByText("You're in")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
  });
});

describe('search on the screen', () => {
  const week = async () => {
    const { ana } = await world();
    for (const [title, host] of [['Sunset run, easy 5K', 'Running Club'], ['Dumpling night', 'Supper Club'], ['Resume drop-in', 'Career Services'], ['Sunrise hike', 'Outing Club'], ['Ballroom open floor', 'Dance Club'], ['Demo night', 'Builders']]) await event(title, { host, hours: 4 });
    return show(as(ana));
  };
  it('says what the row holds, and updates as the person types without leaving the screen', async () => {
    await week();
    expect(screen.getByRole('heading', { level: 2, name: 'Your best 5 of 7 this week' })).toBeInTheDocument();
    expect(screen.getByText('more this week')).toBeInTheDocument();
    const box = screen.getByRole('searchbox', { name: 'Say what you feel like doing' });
    fireEvent.change(box, { target: { value: 'exercise' } });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('for “exercise”');
    expect(screen.getByRole('heading', { name: 'Sunset run, easy 5K' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Resume drop-in' })).toBeNull();
    fireEvent.change(box, { target: { value: 'quidditch' } });
    expect(screen.getByRole('heading', { name: 'Nothing matches' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'eat with people' }));
    expect(screen.getByRole('heading', { name: 'Dumpling night' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All of CampusGroups' }));
    expect(screen.getByRole('button', { name: 'All of CampusGroups' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('shows no reason and no score for the ranking', async () => {
    const { container, model } = await week();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'exercise' } });
    expect(container.innerHTML).not.toMatch(/score|rank|pull|because|recommended|matched on|picked for/i);
    // The numbers the order came from are in the model the server built and nowhere in the page.
    expect(model.tickets.some(ticket => ticket.pull > 0)).toBe(true);
    expect(container.querySelector('[data-pull],[data-score],[data-rank],[title*="match"]')).toBeNull();
  });
});

describe('rewards on the screen', () => {
  it('has no shelf with nothing being earned, and coupons with progress once there is', async () => {
    const { ana, ben } = await world();
    await saveReward(t.db, { campusId: cornell.id, giver: 'Collegetown Bagels', kind: 'building', texts: ['$5 off any order'], rule: 'outings', ruleCount: 3 });
    await show(as(ana));
    expect(screen.queryByText('Rewards you are earning')).toBeNull();
    cleanup();
    const study = await event('Study group', { hours: 0.2 }), mine = await imIn(t.db, ana.personId, study);
    await joinByToken(t.db, ben.personId, mine.token);
    await checkIn(t.db, ana.personId, study); await checkIn(t.db, ben.personId, study);
    await show(as(ana));
    expect(screen.getByRole('heading', { name: 'Rewards you are earning' })).toBeInTheDocument();
    expect(screen.getByText('$5 off any order')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 outings')).toBeInTheDocument();
  });
  it('an unlocked group reward shows at the counter in the top bar, and is marked used once', async () => {
    const { ana, ben } = await world();
    const coffee = await event('CS 2110 study group', { host: 'Northside Coffee', hours: 0.2 });
    await saveReward(t.db, { campusId: cornell.id, giver: 'Northside Coffee', kind: 'group', listingId: coffee, headCount: 2, texts: ['A drink and a pastry, $4.50 each'] });
    const mine = await imIn(t.db, ana.personId, coffee);
    await joinByToken(t.db, ben.personId, mine.token);
    expect(await withPortalTestSession(ana, () => markUsed(coffee))).toMatchObject({ ok: false });   // nobody has checked in
    expect(await withPortalTestSession(ana, () => checkInAction(coffee))).toEqual({ ok: true });
    await checkIn(t.db, ben.personId, coffee);
    await show(as(ana));
    expect(screen.getByText('Show at the counter')).toBeInTheDocument();
    expect(screen.getByText(/Unlocked for your group/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark as used' }).length).toBe(2);
    expect(await withPortalTestSession(ana, () => markUsed(coffee))).toEqual({ ok: true });
    expect(await withPortalTestSession(ben, () => markUsed(coffee))).toEqual({ ok: true });
    expect((await t.db.query('select 1 from campus_reward_use')).rows).toHaveLength(1);
    cleanup();
    await show(as(ana));
    expect(screen.queryByText('Show at the counter')).toBeNull();
    expect(screen.getAllByText(/^Used \d/).length).toBeGreaterThan(0);
  });
});

describe('the pages', () => {
  // A page hands back the async part that draws the week; a test has to run it, as the server would.
  const drawn = async (node: Promise<React.ReactElement>) => { const element = await node as React.ReactElement<object, (props: object) => Promise<React.ReactElement>>; return typeof element.type === 'function' ? element.type(element.props) : element; };
  const page = (slug: string) => drawn(CampusPage({ params: Promise.resolve({ campus: slug }) }));
  const linked = (token: string) => drawn(OutingLinkPage({ params: Promise.resolve({ token }) }));
  const sentTo = (path: string) => expect.objectContaining({ digest: expect.stringContaining(`;${path};`) });
  it('an unknown campus is not found', async () => {
    await expect(page('nowhere')).rejects.toMatchObject({ digest: expect.stringContaining('404') });
  });
  it('a signed-out visitor sees the campus screen', async () => {
    await world();
    render(await page('cornell'));
    expect(screen.getByRole('heading', { name: 'Blitz night' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'This week' })).toHaveAttribute('aria-current', 'page');
  });
  it("another school's address sends a person to their own, and each school has its own list", async () => {
    await world();
    const nyu = await person('Noor Haddad', 'noor@stern.nyu.edu');
    await expect(withPortalTestSession(nyu, () => page('cornell'))).rejects.toEqual(sentTo('/c/nyu'));
    render(await withPortalTestSession(nyu, () => page('nyu')));
    expect(screen.queryByRole('heading', { name: 'Blitz night' })).toBeNull();
    expect(await withPortalTestSession(nyu, async () => imInAction((await world()).blitz))).toMatchObject({ ok: false, message: expect.stringContaining("another school's list") });
  });
  it('a person at no school is shown the default campus, and the admin opens any campus', async () => {
    await world();
    const outsider = await person('Omar Reyes', 'omar@gmail.com');
    render(await withPortalTestSession(outsider, () => page('cornell')));
    expect(screen.getByRole('heading', { name: 'Blitz night' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Post a plan' })).toBeInTheDocument();
    // Another school's address sends them back to the default one.
    await expect(withPortalTestSession(outsider, () => page('columbia'))).rejects.toEqual(sentTo('/c/cornell'));
    cleanup();
    vi.stubEnv('LOOP_ADMIN', 'omar@gmail.com');
    render(await withPortalTestSession(outsider, () => page('columbia')));
    expect(screen.getByRole('link', { name: 'Post a plan' })).toBeInTheDocument();
  });
  it('an unknown share link is not found, and a real one opens its event', async () => {
    const { zebs } = await world();
    await expect(linked('nosuchtokennosuch')).rejects.toMatchObject({ digest: expect.stringContaining('404') });
    render(await linked(zebs.token));
    expect(screen.getAllByRole('link', { name: 'Join' })[0]).toHaveAttribute('href', `/sign-in?redirect_url=${encodeURIComponent(`/o/${zebs.token}`)}`);
  });
  it('the post form needs sign-in, and lets only the poster change a plan', async () => {
    const { ana, ben } = await world(), post = (plan?: string) => PostPlanPage({ params: Promise.resolve({ campus: 'cornell' }), searchParams: Promise.resolve(plan ? { plan } : {}) });
    await expect(post()).rejects.toEqual(sentTo('/sign-in?redirect_url=%2Fc%2Fcornell%2Fpost'));
    render(await withPortalTestSession(ana, () => post()));
    expect(screen.getByRole('heading', { level: 1, name: 'Post a plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post it' })).toBeInTheDocument();
    cleanup();
    const plan = await postPlan(t.db, ana.personId, cornell, { title: 'Sunset run', starts: new Date(Date.now() + 26 * 3600000).toISOString().slice(0, 16) });
    render(await withPortalTestSession(ana, () => post(plan.id)));
    expect(screen.getByRole('textbox', { name: 'What is the plan?' })).toHaveValue('Sunset run');
    expect(screen.getByRole('button', { name: 'Cancel this plan' })).toBeInTheDocument();
    await expect(withPortalTestSession(ben, () => post(plan.id))).rejects.toMatchObject({ digest: expect.stringContaining('404') });
  });
  it('the admin page is for the admin alone', async () => {
    const { ana } = await world(), admin = () => CampusAdminPage({ searchParams: Promise.resolve({ campus: 'cornell' }) });
    await expect(admin()).rejects.toEqual(sentTo('/sign-in?redirect_url=%2Fc%2Fadmin'));
    await expect(withPortalTestSession(ana, admin)).rejects.toMatchObject({ digest: expect.stringContaining('404') });
    vi.stubEnv('LOOP_ADMIN', 'ana@cornell.edu');
    render(await withPortalTestSession(ana, admin));
    expect(screen.getByRole('heading', { level: 1, name: 'Admin' })).toBeInTheDocument();
    for (const section of ['Campus', 'Feeds', 'Places', 'Rewards', 'Events']) expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument();
    expect(screen.getByText(/Chess Club: Skip the door/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Good-for words of Blitz night' })).toBeInTheDocument();
  });
});

// PREVIEW_DIR=… writes the screen's states as static pages, with the real stylesheet, for screenshots.
it.skipIf(!process.env.PREVIEW_DIR)('previews', async () => {
  const { writeFileSync, readFileSync } = await import('node:fs'), { renderToStaticMarkup } = await import('react-dom/server'), { pathToFileURL } = await import('node:url');
  const css = readFileSync('app/c/campus.css', 'utf8'), font = pathToFileURL('public/fonts/Archivo.ttf').href;
  const save = (name: string, model: Awaited<ReturnType<typeof campusScreen>>, openId?: string) => writeFileSync(`${process.env.PREVIEW_DIR}/${name}.html`,
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>@font-face{font-family:Archivo;src:url(${font});font-weight:100 900;font-stretch:62% 125%}:root{--font-archivo:Archivo}body{margin:0}${css}</style></head><body>${renderToStaticMarkup(<CampusScreen screen={model} signInHref="/sign-in" openId={openId} />)}</body></html>`);
  const { ana, ben, zeb, blitz } = await world(), [maya, dev, kai] = [await person('Maya Chen'), await person('Dev Patel'), await person('Kai Nakamura')];
  await group('Supper Club', ana, maya, dev, kai);
  await t.db.query("insert into campus_place(campus_id,name,other_names,lat,lon) values($1,'Northside Coffee','{}',42.4534,-76.4780),($1,'Arts Quad','{}',42.4488,-76.4845)", [cornell.id]);
  const cs = await event('CS 2110 study group', { host: 'Northside Coffee', place: 'Northside Coffee, the back table', about: 'Problem set 6, worked through together. Bring a laptop.', hours: 0.2 });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Northside Coffee', kind: 'group', listingId: cs, headCount: 3, texts: ['A drink and a pastry, $4.50 each', 'A drink and a pastry, $4.00 each'] });
  const mine = await imIn(t.db, ana.personId, cs);
  await joinByToken(t.db, maya.personId, mine.token); await joinByToken(t.db, dev.personId, mine.token);
  await checkIn(t.db, maya.personId, cs); await checkIn(t.db, dev.personId, cs);
  const run = await postPlan(t.db, kai.personId, cornell, { title: 'Sunset run, easy 5K', starts: new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 16), place: 'Arts Quad, meet at the statue', about: 'Conversation pace, nobody gets dropped.' });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Finger Lakes Running Co.', kind: 'building', texts: ['20% off Brooks running shoes'], rule: 'word', ruleCount: 5, ruleWord: 'run' });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Collegetown Bagels', kind: 'building', texts: ['$5 off any order'], rule: 'outings', ruleCount: 1 });
  const bao = await event('Dumpling night', { host: 'Bao House', place: 'Bao House', about: 'Order for the table and split it.', hours: 7 });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Bao House', kind: 'group', listingId: bao, headCount: 4, texts: ['Starters on the house'] });
  const table = await imIn(t.db, maya.personId, bao); await joinByToken(t.db, dev.personId, table.token); await joinByToken(t.db, kai.personId, table.token);
  for (const [title, host, hours] of [['Resume drop-in', 'Career Services', 26], ['Ballroom open floor', 'Ballroom Dance Club', 30], ['Demo night', 'Ithaca builders', 52], ['Sunrise hike', 'Outing Club', 70]] as const) await event(title, { host, hours });
  // One earlier outing that counted, so there is something on the shelf.
  const past = await event('Morning run', { hours: 0.1 }), old = await imIn(t.db, ana.personId, past);
  await joinByToken(t.db, kai.personId, old.token); await checkIn(t.db, ana.personId, past); await checkIn(t.db, kai.personId, past);
  const photos = async () => Object.fromEntries([ana, ben, maya, dev, kai].map((each, at) => [each.personId, `https://i.pravatar.cc/120?img=${[12, 59, 47, 33, 15][at]}`]));
  save('out', await campusScreen(t.db, cornell, null, { photos }));
  save('in', await campusScreen(t.db, cornell, as(ana), { photos }));
  save('in-open', await campusScreen(t.db, cornell, as(ana), { photos }), cs);
  save('in-open-nomap', await campusScreen(t.db, cornell, as(ana), { photos }), blitz);
  save('in-initials', await campusScreen(t.db, cornell, as(ana, true), { photos: noPhotos }), run.id);
  expect(zeb.personId).toBeTruthy();
});
