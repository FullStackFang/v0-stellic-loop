import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { setMemberHandle } from '@/lib/emba/tags';
import { askResults, closeAsk, createAsk, listAsks } from '@/lib/emba/team-asks';
import { addEvent } from '@/lib/emba/team-events';
import { claim } from '@/lib/emba/team-records';
import { onYou } from '@/lib/emba/team-waiting';
import { OnYou } from './on-you';

// Specs: openspec/changes/loop-on-you/specs/on-you-page. The list is drawn from the database and its buttons call the real
// actions; a button is pressed outside the test's session, so each action is run as whoever `session.who` names.
const session = vi.hoisted(() => ({ who: null as unknown }));
vi.mock('./actions', async original => {
  const real = await original<typeof import('./actions')>(), { withPortalTestSession: as } = await import('@/lib/emba/portal-session');
  const signedIn = <A extends unknown[], R>(action: (...args: A) => R) => (...args: A) => session.who ? as(session.who as Principal, () => action(...args)) : action(...args);
  return { ...real, answerOnYouAction: signedIn(real.answerOnYouAction), interestOnYouAction: signedIn(real.interestOnYouAction), claimOnYouAction: signedIn(real.claimOnYouAction), askGroupAction: signedIn(real.askGroupAction) };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from emba_deletion_tombstone'); session.who = null; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

async function person(email: string, name: string) {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 16);
async function fixture() {
  const owner = await person('owner@cornell.edu', 'Olive Owner');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const make = async (name: string, namespace: string) => { const group = await createWorkspace(t.db, owner, { name, description: '', namespace }); return { orgId: group.orgId, loopId: group.loopId }; };
  const club = await make('Hiking club', 'hiking-club');
  const join = async (who: Principal, scope: { orgId: string; loopId: string }, handle: string, role = 'member') => {
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [scope.orgId, who.personId]);
    await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [scope.orgId, scope.loopId, who.personId, role]);
    await setMemberHandle(t.db, who, { orgId: scope.orgId, handle });
  };
  const ana = await person('ana@cornell.edu', 'Ana Smith'), ben = await person('ben@cornell.edu', 'Ben Jones'), outsider = await person('una@cornell.edu', 'Una Out');
  await join(ana, club, 'ana'); await join(ben, club, 'ben');
  const saved = async <T extends { saved: boolean }>(result: Promise<T>) => { const done = await result; if (!done.saved) throw new Error(`fixture not saved: ${JSON.stringify(done)}`); return done as Extract<T, { saved: true }>; };
  return { owner, ana, ben, outsider, club, make, join, saved };
}
/** Draws the counter as `who` would see it and opens the panel. Null when nothing is drawn. */
async function show(who: Principal | null) {
  session.who = who;
  const drawn = await (who ? withPortalTestSession(who, () => OnYou()) : OnYou());
  if (!drawn) return null;
  render(drawn);
  const pill = screen.getByRole('button', { name: /^On you/ });
  if (pill.getAttribute('aria-expanded') !== 'true') fireEvent.click(pill);
  return screen.getByRole('region', { name: 'On you' });
}
const rowOf = (text: string) => screen.getByText(text).closest('li')!;
const left = (text: string) => waitFor(() => expect(screen.queryByText(text)).not.toBeInTheDocument(), { timeout: 4000 });

it('draws nothing for a signed-out visitor or a person in no group, and for a member lists each thing with its label, group and time', async () => {
  const f = await fixture();
  expect(await show(null)).toBeNull();
  expect(await show(f.outsider)).toBeNull();
  await f.saved(createAsk(t.db, f.ana, { ...f.club, question: 'Which trail?', kind: 'one', options: ['Gorge', 'Ridge'], closesAt: inDays(1) }));
  await f.saved(createAsk(t.db, f.ana, { ...f.club, question: 'Sign the waiver', kind: 'done', closesAt: inDays(3) }));
  await f.saved(createAsk(t.db, f.ana, { ...f.club, question: 'Anything you cannot eat?', kind: 'text', closesAt: inDays(5) }));
  await f.saved(addEvent(t.db, f.owner, { ...f.club, slug: 'night-hike', name: 'Night hike', startsAt: `${inDays(2)}Z` }));
  const panel = (await show(f.ben))!;
  expect(screen.getByRole('button', { name: /^On you/ }).textContent).toBe('On you4');
  const rows = within(panel).getAllByRole('listitem');
  expect(rows.map(row => row.querySelector('.cs-oy-what')!.textContent)).toEqual(['Which trail?', 'Night hike', 'Sign the waiver', 'Anything you cannot eat?']);
  expect(rows.map(row => row.querySelector('.cs-oy-k')!.textContent)).toEqual(['Vote', 'Show up', 'Do', 'Vote']);
  for (const row of rows) expect(row.querySelector('.cs-oy-grp')!.textContent).toBe('Hiking club');
  expect(rows[0].querySelector('time')!.textContent).toMatch(/^Closes \w{3} \d/);
  expect(rows[2].querySelector('time')!.textContent).toMatch(/^Due \w{3} \d/);
  // The person's groups are named, each a link to its page.
  expect(within(within(panel).getByRole('navigation', { name: 'Your groups' })).getByRole('link', { name: 'Hiking club' })).toHaveAttribute('href', '/groups/hiking-club');
  // A short pick-one ask is answered where it is; a written answer opens on the ask's own page.
  expect(within(rows[0]).getAllByRole('button').map(button => button.textContent)).toEqual(['Gorge', 'Ridge']);
  expect(within(rows[3]).getByRole('link', { name: 'Write an answer' }).getAttribute('href')).toMatch(/^\/a\/[\w-]+$/);
});

it('writes from a row, says what was recorded, and the row leaves', async () => {
  const f = await fixture();
  const vote = await f.saved(createAsk(t.db, f.ana, { ...f.club, question: 'Which trail?', kind: 'one', options: ['Gorge', 'Ridge'], closesAt: inDays(1) }));
  const todo = await f.saved(createAsk(t.db, f.ana, { ...f.club, question: 'Sign the waiver', kind: 'done', closesAt: inDays(3) }));
  await f.saved(addEvent(t.db, f.owner, { ...f.club, slug: 'night-hike', name: 'Night hike', startsAt: `${inDays(2)}Z` }));
  await f.saved(addEvent(t.db, f.owner, { ...f.club, slug: 'potluck', name: 'Potluck', startsAt: `${inDays(4)}Z` }));
  await show(f.ben);
  fireEvent.click(within(rowOf('Sign the waiver')).getByRole('button', { name: 'Done' }));
  expect(await within(rowOf('Sign the waiver')).findByRole('status')).toHaveTextContent('Done');
  await left('Sign the waiver');
  expect((await askResults(t.db, f.ana, { ...f.club, number: todo.ask.number })).ask.done?.map(person => person.handle)).toEqual(['@hiking-club/ben']);
  fireEvent.click(within(rowOf('Which trail?')).getByRole('button', { name: 'Ridge' }));
  expect(await within(rowOf('Which trail?')).findByRole('status')).toHaveTextContent('You voted Ridge');
  await left('Which trail?');
  expect((await askResults(t.db, f.ben, { ...f.club, number: vote.ask.number })).ask.yourAnswer?.choices.map(choice => choice.label)).toEqual(['Ridge']);
  fireEvent.click(within(rowOf('Night hike')).getByRole('button', { name: "I'm in" }));
  await left('Night hike');
  fireEvent.click(within(rowOf('Potluck')).getByRole('button', { name: 'Not for me' }));
  expect(await within(rowOf('Potluck')).findByRole('status')).toHaveTextContent('Not for you');
  await left('Potluck');
  expect(screen.getByText('Nothing is waiting on you.')).toBeInTheDocument();
  expect(await onYou(t.db, f.ben)).toMatchObject({ count: 0, rows: [] });
}, 60000);

it('says an ask has closed and lets the row go, and keeps a row whose write was refused with the reason', async () => {
  const f = await fixture();
  const gone = await f.saved(createAsk(t.db, f.ana, { ...f.club, question: 'Sign the waiver', kind: 'done', closesAt: inDays(3) }));
  await f.saved(createAsk(t.db, f.ana, { ...f.club, question: 'Pay the fee', kind: 'done', closesAt: inDays(4) }));
  await show(f.ben);
  await f.saved(closeAsk(t.db, f.ana, { ...f.club, number: gone.ask.number }));
  fireEvent.click(within(rowOf('Sign the waiver')).getByRole('button', { name: 'Done' }));
  expect(await within(rowOf('Sign the waiver')).findByRole('status')).toHaveTextContent('This has closed.');
  await left('Sign the waiver');
  // Ben now only follows the group: the write is refused, the row says why and stays where it is.
  await t.db.query("update emba_role set role='follower' where person_id=$1", [f.ben.personId]);
  fireEvent.click(within(rowOf('Pay the fee')).getByRole('button', { name: 'Done' }));
  expect(await within(rowOf('Pay the fee')).findByRole('alert')).toHaveTextContent('Only members can do this');
  expect(within(rowOf('Pay the fee')).getByRole('button', { name: 'Done' })).toBeEnabled();
}, 60000);

it('lists something to do that passed as missed with no button, and shows work proposed for the person first', async () => {
  const f = await fixture();
  await f.saved(createAsk(t.db, f.ana, { ...f.club, question: 'Send your headshot', kind: 'done', closesAt: inDays(2) }));
  await t.db.query('alter table emba_ask disable trigger emba_ask_guard');
  await t.db.query("update emba_ask set created_at=clock_timestamp()-interval '9 days',closes_at=clock_timestamp()-interval '1 day'");
  await t.db.query('alter table emba_ask enable trigger emba_ask_guard');
  const proposed = await f.saved(claim(t.db, f.ana, { ...f.club, what: 'Book the room', owner: 'ben' }));
  session.who = f.ben;
  render((await withPortalTestSession(f.ben, () => OnYou()))!);
  // Work put on the person opens the panel by itself.
  const panel = screen.getByRole('region', { name: 'On you' }), rows = within(panel).getAllByRole('listitem');
  expect(rows.map(row => row.querySelector('.cs-oy-k')!.textContent)).toEqual(['Yours?', 'Missed']);
  expect(within(rows[1]).queryByRole('button')).not.toBeInTheDocument();
  expect(rows[1].querySelector('time')!.textContent).toMatch(/^Passed /);
  expect(rows[0].textContent).toContain('@hiking-club/ana put this on you');
  fireEvent.click(within(rows[0]).getByRole('button', { name: "It's mine" }));
  expect(await within(rowOf('Book the room')).findByRole('status')).toHaveTextContent('Yours now');
  await left('Book the room');
  const { rows: [record] } = await t.db.query<{ status: string }>('select claim_status as status from emba_team_record where number=$1 and org_id=$2', [proposed.record.number, f.club.orgId]);
  expect(record.status).toBe('open');
  // With motion reduced nothing here is animated.
  const { readFileSync } = await import('node:fs');
  expect(readFileSync('app/c/on-you.css', 'utf8')).toMatch(/prefers-reduced-motion: reduce\) \{[^}]*\.cs-oy-hand[^}]*animation: none/);
}, 60000);

it('lets a member ask a group in one line, choosing among their groups, and offers it to no follower', async () => {
  const f = await fixture();
  const trip = await f.make('Trip crew', 'trip-crew');
  await f.join(f.ben, trip, 'ben');
  await show(f.ben);
  fireEvent.click(screen.getByRole('button', { name: 'Ask a group' }));
  const send = screen.getByRole('button', { name: 'Ask the group' }), line = screen.getByRole('textbox', { name: 'Ask a group in one line' });
  fireEvent.change(line, { target: { value: 'upload your W8 by friday' } });
  // The line says what and when; with two groups it does not yet say which.
  expect(screen.getByText('Which group? Type @')).toBeInTheDocument();
  expect(screen.getByText(/^Due Fri \d+ \w{3}, 11:59pm$/)).toBeInTheDocument();
  expect(send).toBeDisabled();
  fireEvent.click(within(screen.getByRole('group', { name: 'Your groups' })).getByRole('button', { name: '@trip-crew' }));
  expect((line as HTMLTextAreaElement).value).toBe('upload your W8 by friday @trip-crew');
  expect(send).toBeEnabled();
  fireEvent.click(send);
  expect(await screen.findByText('Asked. It is on the list of everyone in Trip crew.')).toBeInTheDocument();
  const asked = await listAsks(t.db, f.ben, trip);
  expect(asked.open.items).toMatchObject([{ question: 'Upload your W8', kind: 'done', youAsked: true }]);
  expect((await listAsks(t.db, f.ben, f.club)).open.items).toEqual([]);
  // A refusal is worded: a pick-one ask with one option twice.
  fireEvent.change(line, { target: { value: 'which trail? tomorrow @hiking-club' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pick one' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Options, separated by commas' }), { target: { value: 'Gorge, Gorge' } });
  fireEvent.click(send);
  expect(await screen.findByText('Not saved. Two of the options are the same.')).toBeInTheDocument();
  cleanup();
  // A follower reads the group and may not ask it anything.
  await t.db.query("update emba_role set role='follower' where person_id=$1", [f.ana.personId]);
  await show(f.ana);
  expect(screen.queryByRole('button', { name: 'Ask a group' })).not.toBeInTheDocument();
}, 60000);

it('shows a person in no group what they are going to this week, and nothing to someone with neither', async () => {
  const f = await fixture();
  session.who = f.outsider;
  expect(await withPortalTestSession(f.outsider, () => OnYou({ going: [] }))).toBeNull();
  render((await withPortalTestSession(f.outsider, () => OnYou({ going: [{ id: 'l1', title: 'Sunrise run', when: 'Fri 6:30am', href: '/o/abc' }] })))!);
  fireEvent.click(screen.getByRole('button', { name: /^On you/ }));
  expect(screen.getByRole('link', { name: /Sunrise run/ })).toHaveAttribute('href', '/o/abc');
  expect(screen.queryByRole('button', { name: 'Ask a group' })).not.toBeInTheDocument();
});
