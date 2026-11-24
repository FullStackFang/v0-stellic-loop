import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import type { PageRead } from '@/lib/emba/event-link';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { CampusScreen } from '@/components/campus/screen';
import { findCampus, weekListings, type Campus } from '@/lib/campus/listings';
import { postPlan } from '@/lib/campus/plans';
import { campusScreen } from '@/lib/campus/screen';
import { localInput } from '@/lib/campus/time';
import { postLineAction, postPlanAction, readPlanLinkAction } from './actions';

// Specs: openspec/changes/loop-group-event-links/specs/campus-one-line and campus-event-links. No event page is requested here.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', async original => ({ ...(await original<typeof import('next/navigation')>()), useRouter: () => router }));
const read = vi.hoisted(() => ({ page: vi.fn<(url: string) => Promise<PageRead>>() }));
vi.mock('@/lib/emba/event-link', async original => ({ ...(await original<typeof import('@/lib/emba/event-link')>()), readEventPage: read.page }));

let t: TestDb, cornell: Campus;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from campus_tag'); cornell = (await findCampus(t.db, 'cornell'))!; read.page.mockReset(); router.push.mockReset(); router.refresh.mockReset(); });
afterEach(() => { cleanup(); });

async function person(name: string, email = `${name.split(' ')[0].toLowerCase()}@cornell.edu`): Promise<Principal> {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
const LUMA = 'https://lu.ma/4mkwpko0';
// Tomorrow, on the minute.
const starts = new Date(Math.floor(Date.now() / 60000) * 60000 + 26 * 3600000), ends = new Date(starts.getTime() + 2 * 3600000);
const celebration: PageRead = { ok: true, facts: { name: 'Special Special 10 Year Celebration', startsAt: starts.toISOString(), endsAt: ends.toISOString(), place: '40 E 1st St', host: 'Special Special' } };
const tomorrow = () => localInput(cornell.tz, starts);
/** This week as that person sees it, with the posting panel opened from the "+" in the corner. */
const open = async (who: Principal) => {
  render(<CampusScreen signInHref="/sign-in" screen={await campusScreen(t.db, cornell, { personId: who.personId, admin: false })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Post a plan' }));
};
const sentTo = (path: string) => expect.objectContaining({ digest: expect.stringContaining(`;${path};`) });
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries({ campus: 'cornell', ...fields })) data.set(key, value); return data; };
const line = () => screen.getByRole('textbox', { name: 'What are you up to?' });
const say = (text: string) => fireEvent.change(line(), { target: { value: text } });

it('the "+" on This week opens posting, which is one line: Loopd shows what it understood, and the plan lands on the list with its @place', async () => {
  const ana = await person('Ana Lopez');
  await withPortalTestSession(ana, async () => {
    render(<CampusScreen signInHref="/sign-in" screen={await campusScreen(t.db, cornell, { personId: ana.personId, admin: false })} />);
    // The "+" is always there, and nothing is asked until it is pressed. On an empty week the panel opens beside the empty card.
    expect(screen.queryByRole('textbox', { name: 'What are you up to?' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Post a plan' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Post a plan' }));
    expect(screen.getByRole('button', { name: 'Post a plan' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Nothing here yet' })).toBeInTheDocument();
    // Nobody has made a tag here yet, so the third row has no tags to offer. Typing @ brings them in.
    expect(screen.queryByRole('heading', { name: 'Near you' })).toBeNull();
    expect(document.querySelector('.cs-sug')).toBeNull();
    expect(screen.getByText('Shows at Cornell at once. You are counted in.')).toBeInTheDocument();
    say('dumplings @co');
    expect(screen.getByRole('button', { name: /Make @co/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Starts')).toBeNull();
    say('dumplings tomorrow 7pm @collegetown ');
    const understood = document.querySelector('.cs-read')!;
    expect(within(understood as HTMLElement).getByText('Dumplings')).toBeInTheDocument();
    expect(within(understood as HTMLElement).getByText(/7pm$/)).toBeInTheDocument();
    expect(within(understood as HTMLElement).getByText('@collegetown', { selector: '.cs-chip' })).toHaveTextContent('@collegetownnew');
    fireEvent.click(screen.getByRole('button', { name: 'Post it' }));
    // Posted: the panel closes and the list is asked for again.
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(screen.queryByRole('textbox', { name: 'What are you up to?' })).toBeNull();
  });
  expect((await weekListings(t.db, cornell))[0]).toMatchObject({ title: 'Dumplings', tags: ['collegetown'], postedBy: ana.personId, going: 1 });
});

it('typing @ lists the places people use, the busiest first, and offers to make a new one', async () => {
  const ana = await person('Ana Lopez'), ben = await person('Ben Okafor'), cy = await person('Cy Park');
  await postPlan(t.db, ben.personId, cornell, { title: 'Hot pot', starts: tomorrow(), tag: 'collegetown' });
  await postPlan(t.db, cy.personId, cornell, { title: 'Ramen', starts: tomorrow(), tag: 'collegetown' });
  await postPlan(t.db, cy.personId, cornell, { title: 'Pickup', starts: tomorrow(), tag: 'college-ave-courts' });
  await withPortalTestSession(ana, async () => {
    await open(ana);
    say('dumplings tonight 7 @coll');
    const offered = screen.getAllByRole('button').filter(button => button.closest('.cs-sug')).map(button => button.textContent);
    expect(offered).toEqual(['@collegetown2', '@college-ave-courts1', 'Make @coll']);
    fireEvent.click(screen.getByRole('button', { name: /@collegetown/ }));
    expect(line()).toHaveValue('dumplings tonight 7 @collegetown ');
    expect(within(document.querySelector('.cs-read') as HTMLElement).getByTitle('2 people this week')).toHaveTextContent('@collegetown2');
    // What is already on there is offered to join instead.
    const already = screen.getByRole('heading', { name: /Already on/ }).parentElement!;
    expect(within(already).getByText('Hot pot')).toBeInTheDocument();
    // Nobody joins from here unseen: each opens the plan's own panel, with where and when, and its own way in.
    expect(within(already).queryByRole('button', { name: 'Join' })).toBeNull();
    expect(within(already).getAllByRole('button', { name: /^Look at / })).toHaveLength(2);
    fireEvent.click(within(already).getByRole('button', { name: 'Look at Hot pot' }));
    expect(screen.queryByRole('textbox', { name: 'What are you up to?' })).toBeNull();
    const sheet = document.querySelector('.cs-sheet') as HTMLElement;
    expect(within(sheet).getByRole('heading', { name: 'Hot pot' })).toBeInTheDocument();
    expect(within(sheet).getByText('Posted by Ben')).toBeInTheDocument();
    // The way in is on the plan's ticket, which sits beside the panel.
    expect(within(document.querySelector('.cs-ev.open') as HTMLElement).getByRole('button', { name: 'I\u2019m in' })).toBeInTheDocument();
  });
});

// Spec: openspec/changes/loop-campus-tags/specs/campus-tags ("Suggestions come from the whole group").
it('typing the start of any tag in a group offers the group under its lead; a person may keep their own word, and a plan carries several tags', async () => {
  const ana = await person('Ana Lopez'), ben = await person('Ben Okafor'), cy = await person('Cy Park');
  await postPlan(t.db, ben.personId, cornell, { title: 'Easy 5K', starts: tomorrow(), tags: ['running'] });
  await postPlan(t.db, cy.personId, cornell, { title: 'Morning loop', starts: tomorrow(), tags: ['jogging'] });
  await withPortalTestSession(ana, async () => {
    await open(ana);
    say('laps tomorrow 7pm @jog');
    const offered = screen.getAllByRole('button').filter(button => button.closest('.cs-sug')).map(button => button.textContent);
    expect(offered).toEqual(['@running2', 'Make @jog']);
    fireEvent.click(screen.getByRole('button', { name: /@running/ }));
    expect(line()).toHaveValue('laps tomorrow 7pm @running ');
    // Their own word is kept as typed, and counted with the group. Each tag has its own chip.
    say('laps tomorrow 7pm @jogging @collegetown ');
    expect(screen.queryByRole('button', { name: /Make @/ })).toBeNull();
    const understood = document.querySelector('.cs-read') as HTMLElement;
    expect(within(understood).getByText('@jogging', { selector: '.cs-chip' })).toHaveTextContent('@jogging2');
    expect(within(understood).getByText('@jogging is counted with @running')).toBeInTheDocument();
    expect(within(understood).getByText('@collegetown', { selector: '.cs-chip' })).toHaveTextContent('@collegetownnew');
    // Plans with any tag of the group are offered to join.
    const already = screen.getByRole('heading', { name: 'Already on' }).parentElement!;
    expect(within(already).getByText('Easy 5K')).toBeInTheDocument();
    expect(within(already).getByText('Morning loop')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Post it' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });
  expect((await weekListings(t.db, cornell)).find(plan => plan.title === 'Laps')).toMatchObject({ tags: ['jogging', 'collegetown'], tag: null });
  cleanup();
  render(<CampusScreen signInHref="/sign-in" screen={await campusScreen(t.db, cornell, { personId: ana.personId, admin: false })} />);
  expect([...screen.getByRole('heading', { name: 'Laps' }).parentElement!.querySelectorAll('.cs-at')].map(tag => tag.textContent)).toEqual(['@jogging', '@collegetown']);
});

it('a pasted event link is read into the line, and the plan keeps the link', async () => {
  const ana = await person('Ana Lopez');
  read.page.mockResolvedValue(celebration);
  await withPortalTestSession(ana, async () => {
    await open(ana);
    say('lu.ma/4mkwpko0?utm_source=whatsapp');
    expect(await screen.findByText('Read from lu.ma. Add an @tag if you like, then post it.')).toBeInTheDocument();
    expect(read.page).toHaveBeenCalledWith(LUMA);
    expect(line()).toHaveValue('');
    expect(screen.getByText('Special Special 10 Year Celebration')).toBeInTheDocument();
    say('@east-village ');
    fireEvent.click(screen.getByRole('button', { name: 'Post it' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });
  expect((await weekListings(t.db, cornell))[0]).toMatchObject({ title: 'Special Special 10 Year Celebration', link: LUMA, tags: ['east-village'], placeText: '40 E 1st St', about: 'Hosted by Special Special', startsAt: starts.toISOString(), endsAt: ends.toISOString() });
});

it('a line with no time is helped, not refused: times are offered to tap, and a time said with an @ is read as one', async () => {
  const ana = await person('Ana Lopez');
  await withPortalTestSession(ana, async () => {
    await open(ana);
    say('@central-park go for a run @evening ');
    const understood = () => document.querySelector('.cs-read') as HTMLElement;
    expect(within(understood()).getByText('Go for a run')).toBeInTheDocument();
    expect(within(understood()).getByText(/7pm$/)).toBeInTheDocument();
    expect(within(understood()).getByText('@central-park', { selector: '.cs-chip' })).toHaveTextContent('@central-parknew');
    // No time at all: nothing is refused. The day shows with "?" (the people in it can say when works), and the offered times are one tap.
    say('go for a run @central-park ');
    expect(within(understood()).getByText('Today ?')).toBeInTheDocument();
    const offered = within(understood()).getAllByRole('button');
    expect(offered.length).toBeGreaterThan(1);
    fireEvent.click(offered[0]);
    expect(within(understood()).queryAllByRole('button')).toHaveLength(0);
    expect(within(understood()).getByText(/\d(am|pm)$/)).toBeInTheDocument();
    // Typing a time after an @ offers the time, and does not offer to make a place of it.
    say('go for a run @eve');
    expect(screen.getByRole('button', { name: /^evening/ })).toHaveTextContent('A time, not a tag');
    say('go for a run @evening');
    expect(screen.queryByRole('button', { name: /Make @evening/ })).toBeNull();
  });
  expect(await weekListings(t.db, cornell)).toHaveLength(0);
});

it('says what is missing instead of posting, and a link Loopd cannot read asks for what and when', async () => {
  const ana = await person('Ana Lopez');
  await withPortalTestSession(ana, async () => {
    expect(await postLineAction('cornell', '@collegetown', null)).toEqual({ ok: false, message: 'What is it? Say dumplings, a run, a study group.' });
    expect(await postLineAction('cornell', 'dumplings @collegetown on 1/1/2099', null)).toEqual({ ok: false, message: 'Plans can be up to 14 days ahead.' });
    await open(ana);
    say('https://partiful.com/e/abc123 ');
    expect(await screen.findByText('Loopd does not read partiful.com. The link is kept: say what it is and when.')).toBeInTheDocument();
    expect(read.page).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
    expect(screen.queryByText('partiful.com')).toBeNull();
  });
  expect(await weekListings(t.db, cornell)).toHaveLength(0);
});

it('posting and reading a link are for a signed-in person on their own campus', async () => {
  const noor = await person('Noor Haddad', 'noor@stern.nyu.edu');
  expect(await readPlanLinkAction('cornell', LUMA)).toEqual({ ok: false, message: 'Sign in to continue.' });
  expect(await postLineAction('cornell', 'dumplings tonight 7', null)).toMatchObject({ ok: false, signIn: true });
  expect(await withPortalTestSession(noor, () => readPlanLinkAction('cornell', LUMA))).toMatchObject({ ok: false, message: expect.stringContaining("another school's list") });
  expect(await withPortalTestSession(noor, () => postLineAction('cornell', 'dumplings tonight 7', null))).toMatchObject({ ok: false, message: expect.stringContaining("another school's list") });
  expect(read.page).not.toHaveBeenCalled();
  expect(await weekListings(t.db, cornell)).toHaveLength(0);
});

it('the list shows the @place and the event page, finds a plan by its place, and a second person posting the link is counted in', async () => {
  const ana = await person('Ana Lopez'), ben = await person('Ben Okafor'), from = { link: LUMA, title: 'Special Special 10 Year Celebration', starts: tomorrow() };
  expect(await withPortalTestSession(ana, () => postLineAction('cornell', '@east-village', from))).toEqual({ ok: true });
  await expect(withPortalTestSession(ben, () => postPlanAction({ message: '' }, form({ title: 'Typed again', starts: tomorrow(), link: LUMA })))).rejects.toEqual(sentTo('/c/cornell'));
  const list = await weekListings(t.db, cornell);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ title: 'Special Special 10 Year Celebration', link: LUMA, tags: ['east-village'], going: 2, postedBy: ana.personId });
  const week = await campusScreen(t.db, cornell, { personId: ben.personId, admin: false });
  expect(week.tickets[0].words).toContain('east-village');
  render(<CampusScreen signInHref="/sign-in" screen={week} />);
  expect(screen.getByText('@east-village')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Details/ }));
  expect(screen.getByRole('link', { name: 'lu.ma' })).toHaveAttribute('href', LUMA);
});
