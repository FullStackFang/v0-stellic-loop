import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { signInHref } from '@/lib/campus/session';
import { createPoll, saveAnswer } from '@/lib/when/polls';
import { repeatPoll } from '@/lib/when/repeat';
import { sendPoll } from '@/lib/when/send';
import AgainPage from './[id]/again/page';
import WhenPage from './[id]/page';
import { GET as calendar } from './[id]/calendar.ics/route';
import NewWhenPage from './new/page';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const missing = new Error('NEXT_NOT_FOUND');
vi.mock('next/navigation', () => ({ notFound: () => { throw missing; }, redirect: vi.fn() }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://loopd.test'); });
afterAll(async () => { vi.unstubAllEnvs(); await t?.close(); });
beforeEach(async () => { await t.reset(); });
afterEach(cleanup);

const TUE7 = '2026-12-02T00:00:00.000Z', TUE8 = '2026-12-02T01:00:00.000Z', THU7 = '2026-12-04T00:00:00.000Z';
const soon = () => new Date(Date.now() + 5 * 86_400_000).toISOString();
async function person(name: string): Promise<Principal> {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: `${name.toLowerCase()}@cornell.edu` })))!;
}
/** Maya's poll for seven, two thirds: Maya, Josh and Priya can make Tuesday at 7, Maya and Josh at 8 too. Dana has not answered. */
async function fixture() {
  const maya = await person('Maya'), josh = await person('Josh'), priya = await person('Priya'), dana = await person('Dana');
  const { id } = await createPoll(t.db, maya, { title: 'Problem set night', startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: 'America/New_York', expectedSize: 7, deadline: soon(), threshold: 'two_thirds' });
  await saveAnswer(t.db, maya, { pollId: id, slots: [TUE7, TUE8] });
  await saveAnswer(t.db, josh, { pollId: id, slots: [TUE7, TUE8] });
  await saveAnswer(t.db, priya, { pollId: id, slots: [TUE7] });
  return { id, maya, josh, priya, dana };
}
const open = async (who: Principal | null, id: string, query: { edit?: string; pick?: string } = {}) => {
  const page = () => WhenPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(query) });
  return render(await (who ? withPortalTestSession(who, page) : page()));
};
const clean = (html: string) => { expect(html).not.toContain('—'); expect(html.toLowerCase()).not.toContain('fold in'); };

it('shows a visitor who has not signed in what is free so far, and one way in', async () => {
  const { id } = await fixture(), view = await open(null, id);
  expect(screen.getByRole('heading', { name: 'Problem set night' })).toBeInTheDocument();
  expect(view.container).toHaveTextContent('Maya asked · 3 of 7 answered · by Fri 27 Nov');
  expect(view.container).toHaveTextContent('Best so far');
  expect(screen.getByRole('link', { name: 'Sign in to add your times' })).toHaveAttribute('href', signInHref(`/when/${id}`));
  expect(screen.queryByRole('button', { name: 'Tue 1, 7 pm' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save my times' })).toBeNull();
  expect(screen.getByLabelText('Tue 1, 7 pm: 3 free')).toHaveTextContent('3');
  clean(view.container.innerHTML);
});

it('gives someone signed in the grid, with their own times painted and themselves counted once', async () => {
  const { id, priya, dana } = await fixture();
  let view = await open(priya, id);
  expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tue 1, 7 pm' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Tue 1, 7 pm' })).toHaveTextContent('3');
  expect(screen.getByRole('button', { name: 'Tue 1, 8 pm' })).toHaveAttribute('aria-pressed', 'false');
  expect(view.container).toHaveTextContent('The result comes to priya@cornell.edu');
  expect(screen.queryByText('Pass it on')).toBeNull();
  clean(view.container.innerHTML);
  cleanup();
  view = await open(dana, id);
  expect(screen.getByRole('button', { name: 'Tue 1, 7 pm' })).toHaveAttribute('aria-pressed', 'false');
});

it('gives the organizer words to pass on while they wait, and the pick when they ask for it', async () => {
  const { id, maya, josh } = await fixture();
  let view = await open(maya, id);
  expect(screen.getByRole('heading', { name: 'Pass it on' })).toBeInTheDocument();
  expect(view.container).toHaveTextContent(`https://loopd.test/when/${id}`);
  expect(screen.getByRole('link', { name: 'Pick the time now' })).toHaveAttribute('href', `/when/${id}?pick=1`);
  cleanup();
  view = await open(maya, id, { pick: '1' });
  expect(screen.getByRole('heading', { name: 'The times that work best' })).toBeInTheDocument();
  const picks = within(screen.getByRole('radiogroup', { name: 'The times that work best' })).getAllByRole('radio');
  expect(picks.map(each => (each as HTMLInputElement).value)).toEqual([TUE7, TUE8]);
  expect(picks[0]).toBeChecked();
  expect(view.container).toHaveTextContent('3 of 7');
  expect(screen.getByRole('button', { name: 'Send it to everyone' })).toBeInTheDocument();
  expect(view.container).toHaveTextContent('Goes to the 3 who answered, as "Maya via Loopd", with a calendar invite.');
  clean(view.container.innerHTML);
  cleanup();
  await open(josh, id, { pick: '1' });
  expect(screen.queryByRole('button', { name: 'Send it to everyone' })).toBeNull();
});

it('opens on the pick for the organizer once the poll is ready', async () => {
  const { id, maya } = await fixture();
  await t.db.query('update when_poll set ready_at=now(),ready_met=false where id=$1', [id]);
  await open(maya, id);
  expect(screen.getByRole('heading', { name: 'Answers are in. Pick the time.' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send it to everyone' })).toBeInTheDocument();
});

it('shows the result once it is sent: you first, then who is in, then who cannot make it', async () => {
  const { id, maya, josh, priya, dana } = await fixture();
  await saveAnswer(t.db, dana, { pollId: id, slots: [THU7] });
  await sendPoll(t.db, maya, { pollId: id, slot: TUE7, note: 'Olin Library, room 301.' });
  const view = await open(priya, id);
  expect(screen.getByRole('heading', { name: "Tuesday, 7 to 8 pm. It's on." })).toBeInTheDocument();
  expect(view.container).toHaveTextContent('3 of 7 can make it');
  expect(view.container).toHaveTextContent('Olin Library, room 301.');
  const rows = within(screen.getByRole('heading', { name: 'Problem set night' }).parentElement!).getAllByRole('listitem').map(row => row.textContent);
  expect(rows).toEqual(["YouYou're in", 'MayaIn · asked', 'JoshIn', "DanaCan't make it"]);
  expect(screen.getByRole('link', { name: 'Add to my calendar' })).toHaveAttribute('href', `/when/${id}/calendar.ics`);
  expect(screen.getByRole('link', { name: 'Update your answer' })).toHaveAttribute('href', `/when/${id}?edit=1`);
  expect(screen.queryByText('Tell the rest')).toBeNull();
  clean(view.container.innerHTML);
  cleanup();
  await open(null, id);
  expect(screen.getByRole('link', { name: 'Sign in to add your times' })).toBeInTheDocument();
  cleanup();
  await open(josh, id, { edit: '1' });
  expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to the result' })).toBeInTheDocument();
});

it('has nothing at an address that names no poll', async () => {
  await expect(open(null, 'AAAAAAAAAAAA')).rejects.toBe(missing);
  await expect(open(null, 'nope')).rejects.toBe(missing);
});

it('shows the plan to someone signed out, with signing in as the action', async () => {
  let view = render(await NewWhenPage());
  expect(screen.getByRole('link', { name: 'Sign in to create the link' })).toHaveAttribute('href', signInHref('/when/new'));
  expect(screen.getByLabelText('What are you planning')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Two thirds' })).toBeChecked();
  clean(view.container.innerHTML);
  cleanup();
  const maya = await person('Maya');
  view = render(await withPortalTestSession(maya, () => NewWhenPage()));
  expect(screen.getByRole('button', { name: 'Create the link' })).toBeInTheDocument();
});

it('hands out the calendar file only once the time is set', async () => {
  const { id, maya } = await fixture(), get = () => calendar(new Request('https://loopd.test/x'), { params: Promise.resolve({ id }) });
  expect((await get()).status).toBe(404);
  await sendPoll(t.db, maya, { pollId: id, slot: TUE7 });
  const file = await get();
  expect(file.status).toBe(200);
  expect(file.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
  expect(await file.text()).toContain('DTSTART:20261202T000000Z');
  expect((await calendar(new Request('https://loopd.test/x'), { params: Promise.resolve({ id: 'AAAAAAAAAAAA' }) })).status).toBe(404);
});

it('offers the people of a series the same plan next week, and nobody else', async () => {
  const { id, maya, josh, dana } = await fixture(), again = (who: Principal) => withPortalTestSession(who, () => AgainPage({ params: Promise.resolve({ id }) }));
  await expect(again(maya)).rejects.toBe(missing);
  await sendPoll(t.db, maya, { pollId: id, slot: TUE7 });
  await open(josh, id);
  expect(screen.getByRole('link', { name: 'Ask the group again' })).toHaveAttribute('href', `/when/${id}/again`);
  cleanup();
  await open(dana, id);
  expect(screen.queryByRole('link', { name: 'Ask the group again' })).toBeNull();
  cleanup();
  await expect(again(dana)).rejects.toBe(missing);
  const view = render(await again(josh));
  expect(screen.getByRole('heading', { name: 'Same time next week?' })).toBeInTheDocument();
  expect(within(screen.getByRole('heading', { name: 'Your usual times' }).parentElement!).getByText('Tue 7 to 9 pm')).toBeInTheDocument();
  expect(view.container).toHaveTextContent('Tue, 7 pm3 of 7 could make it');
  expect(screen.getByRole('button', { name: 'Ask the group again' })).toBeInTheDocument();
  expect(view.container).toHaveTextContent("Makes a poll for 7 to 11 Dec with everyone's usual times filled in.");
  clean(view.container.innerHTML);
  cleanup();
  const next = (await repeatPoll(t.db, josh, { pollId: id })).id;
  await open(maya, next);
  expect(screen.getByRole('heading', { name: 'Your times from last time. Change them, then save' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tue 8, 7 pm' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Not saved yet.');
});
