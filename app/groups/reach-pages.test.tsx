import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { enableAccessRequests, setJoinMode } from '@/lib/emba/access-requests';
import { reachChoice } from '@/lib/emba/reach';
import { createAsk } from '@/lib/emba/team-asks';
import { addEvent } from '@/lib/emba/team-events';
import { saveBrief } from '@/lib/emba/team-read';
import SharedEventPage from '../e/[token]/page';
import ReachPage from './reach/page';
import StopPage from './reach/stop/[token]/page';
import PersonalAnswerPage from './reach/answer/[token]/page';
import { GET as runReach } from '../api/cron/reach/route';
import { POST as oneClickStop } from '../api/reach/stop/[token]/route';
import { answerFromPersonalLink, saveReachChoice, stopGroupMessages } from './reach-actions';
import { joinFromShareLink } from './request-actions';

// Specs: openspec/changes/loop-club-reach/specs/reach-preferences.
const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', async original => ({ ...await original<typeof import('next/navigation')>(), redirect }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from emba_deletion_tombstone'); redirect.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const idle = { status: 'idle' as const, message: '' };
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
async function person(email: string) {
  const row = await makePerson(t.db);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
async function fixture() {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const club = async (name: string, namespace: string) => { const group = await createWorkspace(t.db, owner, { name, description: '', namespace }); return { orgId: group.orgId, loopId: group.loopId }; };
  const hiking = await club('Hiking club', 'hiking-club'), wine = await club('Wine club', 'wine-club');
  const ana = await person('ana@example.test'), outsider = await person('outsider@example.test');
  for (const scope of [hiking, wine]) {
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [scope.orgId, ana.personId]);
    await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [scope.orgId, scope.loopId, ana.personId]);
  }
  const added = await addEvent(t.db, owner, { ...hiking, slug: 'ridge-walk', name: 'Ridge walk', startsAt: '2099-03-05T18:30' });
  if (!added.saved) throw new Error('fixture event not saved');
  const { rows: [{ share_token: token }] } = await t.db.query<{ share_token: string }>('select share_token from emba_team_event');
  await enableAccessRequests(t.db, owner, { ...hiking, publicLabel: 'Hiking club' });
  return { owner, ana, outsider, hiking, wine, token };
}
const as = <T,>(principal: Principal | null, run: () => T) => principal ? withPortalTestSession(principal, run) : run();
const choices = async () => (await t.db.query<{ way: string }>('select way from emba_reach_choice order by at')).rows.map(row => row.way);

it('states the default on the join form with the control beside it, and saves what the person chose', async () => {
  const f = await fixture();
  render(await as(f.outsider, () => SharedEventPage({ params: Promise.resolve({ token: f.token }) })));
  expect(screen.getByText(/This group will email you at outsider@example\.test when it asks its members something/)).toBeInTheDocument();
  const control = screen.getByRole('combobox', { name: 'How this group reaches you' }) as HTMLSelectElement;
  expect(control.value).toBe('email');
  expect(within(control).getAllByRole('option').map(option => option.textContent)).toEqual(['By email', 'In my assistant and on the site only', 'Not at all']);
  expect(screen.getByRole('button', { name: 'Request to join' })).toBeInTheDocument();
  // A request that waits for an organizer still carries the choice.
  expect(await as(f.outsider, () => joinFromShareLink(idle, form({ kind: 'event', token: f.token, reach: 'assistant' })))).toMatchObject({ status: 'success', message: 'Request sent to the group organizers.' });
  expect(await reachChoice(t.db, f.outsider, f.hiking)).toMatchObject({ way: 'assistant', isDefault: false });
  // Admitted on sign-in: the choice is saved and the person goes back to what they opened.
  await setJoinMode(t.db, f.owner, { ...f.hiking, mode: 'admit' });
  const second = await person('second@example.test');
  await as(second, () => joinFromShareLink(idle, form({ kind: 'event', token: f.token, reach: 'none' })));
  expect(redirect).toHaveBeenCalledWith(`/e/${f.token}`);
  expect(await reachChoice(t.db, second, f.hiking)).toMatchObject({ way: 'none', isDefault: false });
  // The default is saved like any other choice; something that is not a way saves nothing.
  const third = await person('third@example.test'), fourth = await person('fourth@example.test');
  await as(third, () => joinFromShareLink(idle, form({ kind: 'event', token: f.token, reach: 'email' })));
  await as(fourth, () => joinFromShareLink(idle, form({ kind: 'event', token: f.token, reach: 'pigeon' })));
  expect(await reachChoice(t.db, third, f.hiking)).toMatchObject({ way: 'email', isDefault: false });
  expect(await reachChoice(t.db, fourth, f.hiking)).toMatchObject({ way: 'email', isDefault: true });
  expect(await choices()).toEqual(['assistant', 'none', 'email']);
});

it('lists each group on the Reach page with its own control', async () => {
  const f = await fixture();
  const page = async (principal: Principal | null) => render(await as(principal, () => ReachPage()));
  await page(f.ana);
  expect(screen.getByText(/Email goes to ana@example\.test\./)).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent).sort()).toEqual(['Hiking club', 'Wine club']);
  const controls = screen.getAllByRole('combobox', { name: 'This group reaches me' }) as HTMLSelectElement[];
  expect(controls.map(control => control.value)).toEqual(['email', 'email']);
  // WhatsApp is not offered until the member's own message has linked a number.
  expect(within(controls[0]).getAllByRole('option').map(option => option.textContent)).toEqual(['By email', 'In my assistant and on the site only', 'Not at all']);
  cleanup();
  expect(await as(f.ana, () => saveReachChoice(idle, form({ ...f.wine, way: 'none' })))).toMatchObject({ status: 'success' });
  expect(await as(f.ana, () => saveReachChoice(idle, form({ ...f.wine, way: 'whatsapp' })))).toMatchObject({ status: 'error', message: 'WhatsApp is not available yet.' });
  expect(await reachChoice(t.db, f.ana, f.wine)).toMatchObject({ way: 'none' });
  expect(await reachChoice(t.db, f.ana, f.hiking)).toMatchObject({ way: 'email', isDefault: true });
  // Nobody sets a choice for a group they are not in, or without signing in.
  expect(await as(f.outsider, () => saveReachChoice(idle, form({ ...f.wine, way: 'none' })))).toMatchObject({ status: 'error' });
  expect(await saveReachChoice(idle, form({ ...f.wine, way: 'none' }))).toEqual({ status: 'error', message: 'Sign in to continue.' });
  await page(null);
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

it('stops one group from a link with one button, no sign-in, and nothing done on opening it', async () => {
  const f = await fixture();
  for (const scope of [f.hiking, f.wine]) {
    await saveBrief(t.db, f.owner, { ...scope, body: 'A club.', timezone: 'America/New_York', expectedVersion: 0 });
    const asked = await createAsk(t.db, f.owner, { ...scope, question: 'Coming on Friday?', kind: 'one', options: ['Yes', 'No'], closesAt: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 19) + 'Z' });
    if (!asked.saved) throw new Error('fixture ask not saved');
    await t.db.query("insert into emba_reach_message(org_id,loop_id,person_id,kind,ask_id) select k.org_id,k.loop_id,$1,'ask_new',k.id from emba_ask k where k.loop_id=$2", [f.ana.personId, scope.loopId]);
  }
  const { rows: [{ token }] } = await t.db.query<{ token: string }>('select stop_token as token from emba_reach_message where loop_id=$1', [f.hiking.loopId]);
  const page = async (value: string) => render(await StopPage({ params: Promise.resolve({ token: value }) }));
  await page(token);
  expect(screen.getByRole('heading', { name: 'Stop messages from Hiking club' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Stop messages from this group' })).toBeInTheDocument();
  // The page names the group and nobody in it.
  expect(document.body.textContent).not.toMatch(/ana@example\.test|Coming on Friday/);
  expect(await choices()).toEqual([]);
  expect(await stopGroupMessages(idle, form({ token }))).toEqual({ status: 'success', message: 'Done. Hiking club will send you nothing further. Your other groups are unchanged.' });
  expect(await reachChoice(t.db, f.ana, f.hiking)).toMatchObject({ way: 'none' });
  expect(await reachChoice(t.db, f.ana, f.wine)).toMatchObject({ way: 'email', isDefault: true });
  expect((await t.db.query<{ state: string }>('select state from emba_reach_message order by (loop_id=$1) desc', [f.hiking.loopId])).rows.map(row => row.state)).toEqual(['skipped', 'queued']);
  // A link that names nothing shows nothing and does nothing.
  cleanup();
  await page('0'.repeat(32));
  expect(screen.getByRole('heading', { name: 'This link no longer works' })).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(await stopGroupMessages(idle, form({ token: 'not-a-token' }))).toEqual({ status: 'error', message: 'This link no longer works.' });
  // The mail program's own unsubscribe button posts to the message's address and stops that one group.
  const { rows: [{ token: wine }] } = await t.db.query<{ token: string }>('select stop_token as token from emba_reach_message where loop_id=$1', [f.wine.loopId]);
  const post = (value: string) => oneClickStop(new Request('https://loop.test/api/reach/stop/x', { method: 'POST' }), { params: Promise.resolve({ token: value }) });
  expect((await post('0'.repeat(32))).status).toBe(404);
  expect(await reachChoice(t.db, f.ana, f.wine)).toMatchObject({ way: 'email', isDefault: true });
  expect((await post(wine)).status).toBe(204);
  expect(await reachChoice(t.db, f.ana, f.wine)).toMatchObject({ way: 'none' });
});

it('answers one ask from a personal link with no sign-in, and writes nothing when the page is only opened', async () => {
  const f = await fixture();
  await saveBrief(t.db, f.owner, { ...f.hiking, body: 'A club.', timezone: 'America/New_York', expectedVersion: 0 });
  const asked = await createAsk(t.db, f.owner, { ...f.hiking, question: 'Coming on Friday?', kind: 'one', options: ['Yes', 'No'], closesAt: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 19) + 'Z' });
  if (!asked.saved) throw new Error('fixture ask not saved');
  const { rows: [{ token }] } = await t.db.query<{ token: string }>("insert into emba_reach_message(org_id,loop_id,person_id,kind,ask_id) select k.org_id,k.loop_id,$1,'ask_new',k.id from emba_ask k returning answer_token as token", [f.ana.personId]);
  const page = async (value: string) => render(await PersonalAnswerPage({ params: Promise.resolve({ token: value }) }));
  // Nobody is signed in for any of this.
  await page(token);
  expect(screen.getByRole('heading', { name: 'Coming on Friday?' })).toBeInTheDocument();
  expect(screen.getByText('Hiking club')).toBeInTheDocument();
  expect(screen.getAllByRole('radio').map(radio => radio.parentElement!.textContent)).toEqual(['Yes', 'No']);
  expect(screen.getByRole('button', { name: 'Send my answer' })).toBeInTheDocument();
  expect((await t.db.query('select 1 from emba_ask_answer')).rows).toEqual([]);
  const data = form({ token }); data.append('choice', '1');
  expect(await answerFromPersonalLink(idle, data)).toEqual({ status: 'success', message: 'Saved. Your answer: Yes' });
  expect((await t.db.query('select person_id,route from emba_ask_answer')).rows).toEqual([{ person_id: f.ana.personId, route: 'personal_link' }]);
  cleanup();
  await page(token);
  expect(screen.getByText('Your answer: Yes')).toBeInTheDocument();
  expect((screen.getAllByRole('radio') as HTMLInputElement[]).map(radio => radio.checked)).toEqual([true, false]);
  expect(screen.getByRole('button', { name: 'Change my answer' })).toBeInTheDocument();
  // A link that names nothing shows nothing and takes nothing.
  cleanup();
  await page('f'.repeat(32));
  expect(screen.getByRole('heading', { name: 'This link no longer works' })).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(await answerFromPersonalLink(idle, form({ token: 'f'.repeat(32), choice: '1' }))).toEqual({ status: 'error', message: 'This link no longer works.' });
});

it('runs the scheduled send only for the scheduler, and touches nothing while the switch is off or no provider is set', async () => {
  const call = (secret?: string) => runReach(new Request('https://loop.test/api/cron/reach', { headers: secret ? { authorization: `Bearer ${secret}` } : {} }));
  expect((await call()).status).toBe(401);
  vi.stubEnv('CRON_SECRET', 'cron-secret');
  expect((await call('wrong-secret')).status).toBe(401);
  expect(await (await call('cron-secret')).json()).toEqual({ on: false });
  vi.stubEnv('LOOP_REACH_SENDING', 'on');
  const response = await call('cron-secret');
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ on: true, error: 'No email provider is configured' });
});
