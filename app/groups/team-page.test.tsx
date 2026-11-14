import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { setMemberHandle } from '@/lib/emba/tags';
import { claim, fileOutput, logDecision } from '@/lib/emba/team-records';
import { createAsk, listAsks } from '@/lib/emba/team-asks';
import { listTeamEvents } from '@/lib/emba/team-events';
import { upcomingEvents } from '@/lib/emba/team-interest';
import { briefHistory, myRecentRecords } from '@/lib/emba/team-read';
import TeamPage from './[namespace]/team/page';
import { addTeamEvent, amendTeamRecord, announceToTeam, saveTeamBrief } from './team-actions';
import { grantGroupRead, renewGroupRead } from './connection-actions';
import { BriefForm } from '@/components/emba/brief-form';
import ConnectionsPage from './connections/page';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// The page's reads run as they are; each is wrapped only so a test can see which of them a tab made.
vi.mock('@/lib/emba/team-asks', async importOriginal => { const real = await importOriginal<typeof import('@/lib/emba/team-asks')>(); return { ...real, listAsks: vi.fn(real.listAsks) }; });
vi.mock('@/lib/emba/team-events', async importOriginal => { const real = await importOriginal<typeof import('@/lib/emba/team-events')>(); return { ...real, listTeamEvents: vi.fn(real.listTeamEvents) }; });
vi.mock('@/lib/emba/team-interest', async importOriginal => { const real = await importOriginal<typeof import('@/lib/emba/team-interest')>(); return { ...real, upcomingEvents: vi.fn(real.upcomingEvents) }; });
vi.mock('@/lib/emba/team-read', async importOriginal => { const real = await importOriginal<typeof import('@/lib/emba/team-read')>(); return { ...real, briefHistory: vi.fn(real.briefHistory), myRecentRecords: vi.fn(real.myRecentRecords) }; });

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from emba_deletion_tombstone'); });
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
  const group = await createWorkspace(t.db, owner, { name: 'Study team', description: '', namespace: 'study-team' });
  const scope = { orgId: group.orgId, loopId: group.loopId };
  const join = async (email: string, handle: string) => {
    const member = await person(email);
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [group.orgId, member.personId]);
    await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [group.orgId, group.loopId, member.personId]);
    await setMemberHandle(t.db, member, { orgId: group.orgId, handle });
    return member;
  };
  const ana = await join('ana@example.test', 'ana'), ben = await join('ben@example.test', 'ben'), outsider = await person('outsider@example.test');
  return { owner, ana, ben, outsider, scope, ids: { orgId: scope.orgId, loopId: scope.loopId } };
}
// The record shows one section at a time, chosen by ?tab=.
const view = async (principal: Principal, tab?: string) => render(await withPortalTestSession(principal, () => TeamPage({ params: Promise.resolve({ namespace: 'study-team' }), searchParams: Promise.resolve(tab ? { tab } : {}) })));
const act = (principal: Principal, run: () => Promise<{ status: string; message: string }>) => withPortalTestSession(principal, run);

it('shows a member the team as their assistant would see it, with only the controls they may use', async () => {
  const f = await fixture();
  expect((await act(f.owner, () => saveTeamBrief(idle, form({ ...f.ids, body: 'Final deck for Strategy.\nTen slides.', deadline: '2026-11-20', timezone: 'America/New_York', expectedVersion: '0' })))).status).toBe('success');
  expect((await act(f.owner, () => announceToTeam(idle, form({ ...f.ids, text: 'Deck due Friday.' })))).status).toBe('success');
  expect((await act(f.owner, () => addTeamEvent(idle, form({ ...f.ids, slug: 'final-deck', name: 'Final deck' })))).status).toBe('success');
  await logDecision(t.db, f.ana, { ...f.scope, topic: 'deck-tool', statement: 'Google Slides.', newTopic: true });
  await fileOutput(t.db, f.ana, { ...f.scope, url: 'https://files.example.org/deck.pdf', title: 'Deck draft', summary: 'Built in Canva.', decisionsVersion: 1, conflictsWith: [2], fileAnyway: true });
  await claim(t.db, f.ana, { ...f.scope, what: 'Slides 4 to 8', owner: 'ben', tags: ['ben'] });
  await claim(t.db, f.ben, { ...f.scope, what: 'Slides 1 to 3' });

  // The team's name, its announcements and where it stands are beside every tab; decisions open first.
  let ben = await view(f.ben);
  expect(screen.getByRole('heading', { name: 'Study team' })).toBeInTheDocument();
  expect(screen.getByText(/Deck due Friday\./)).toBeInTheDocument();
  expect(screen.getByText(/Google Slides\./)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /2 open claims/ })).toHaveAttribute('href', '/groups/study-team/team?tab=claims');
  expect(screen.getByRole('link', { name: /1 output.*1 flagged/ })).toHaveAttribute('href', '/groups/study-team/team?tab=outputs');
  // The decision an output conflicts with links to that output.
  expect(screen.getByRole('link', { name: /Output #3 is marked as conflicting with this decision/ })).toHaveAttribute('href', '/groups/study-team/team?tab=outputs#r3');
  expect(screen.queryByRole('button', { name: 'Post announcement' })).not.toBeInTheDocument();
  ben.unmount();
  ben = await view(f.ben, 'brief');
  expect(screen.getByText('Ten slides.')).toBeInTheDocument();
  expect(screen.getByText('2026-11-20')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save brief' })).not.toBeInTheDocument();
  ben.unmount();
  ben = await view(f.ben, 'outputs');
  const link = screen.getByRole('link', { name: 'Deck draft' });
  expect(link).toHaveAttribute('href', 'https://files.example.org/deck.pdf');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  expect(screen.getByText(/unrecognised host/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /conflicting with decision #2/ })).toHaveAttribute('href', '/groups/study-team/team?tab=decisions#r2');
  ben.unmount();
  ben = await view(f.ben, 'claims');
  // Ben can answer the claim proposed for him, finish his own, and remove the tag on himself; nothing more.
  expect(screen.getByRole('button', { name: 'Confirm: I will do this' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Mark done' })).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Remove my tag' })).toBeInTheDocument();
  ben.unmount();
  ben = await view(f.ben, 'events');
  expect(screen.getByText('@study-team/final-deck')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create event' })).not.toBeInTheDocument();
  ben.unmount();
  ben = await view(f.ben, 'mine');
  // His recent saves: his own claim only, saved on the site.
  const mine = within(document.getElementById('mine')!);
  expect(mine.getByText(/Slides 1 to 3/)).toBeInTheDocument();
  expect(mine.getByText(/saved on this site/)).toBeInTheDocument();
  expect(mine.queryByText(/Deck draft/)).not.toBeInTheDocument();
  ben.unmount();

  // An owner sees the curation controls and can withdraw anything.
  let withdrawable = 0;
  for (const [tab, names] of Object.entries({ decisions: ['Post announcement'], claims: [], outputs: [], brief: ['Save brief'], events: ['Create event', 'Rename', 'Archive'] })) {
    const owner = await view(f.owner, tab);
    for (const name of names) expect(screen.getByRole('button', { name }), name).toBeInTheDocument();
    // The announcement's own Withdraw sits beside every tab; count it once.
    withdrawable += screen.getAllByRole('button', { name: 'Withdraw' }).length - (tab === 'decisions' ? 0 : 1);
    owner.unmount();
  }
  expect(withdrawable).toBe(5);

  // A signed-in person who is not a member sees nothing about the team.
  await view(f.outsider);
  expect(screen.getByRole('heading', { name: 'Group unavailable' })).toBeInTheDocument();
  expect(screen.queryByText(/Google Slides|Deck draft|Slides 1 to 3|Ten slides/)).not.toBeInTheDocument();
});
it('reads the header and the shown tab only, records no read it did not make, and keeps the tab bar counts', async () => {
  const f = await fixture();
  expect((await createAsk(t.db, f.ana, { ...f.scope, question: 'Red or white?', kind: 'one', options: ['Red', 'White'], closesAt: new Date(Date.now() + 86_400_000).toISOString().slice(0, 19) + 'Z' })).saved).toBe(true);
  const reads = { listAsks: vi.mocked(listAsks), briefHistory: vi.mocked(briefHistory), myRecentRecords: vi.mocked(myRecentRecords), upcomingEvents: vi.mocked(upcomingEvents), listTeamEvents: vi.mocked(listTeamEvents) };
  const made = () => Object.entries(reads).flatMap(([name, read]) => read.mock.calls.map(call => name === 'listTeamEvents' && (call[2] as { archived?: boolean }).archived ? 'archivedEvents' : name)).sort();
  const recorded = async () => (await t.db.query<{ n: number }>("select count(*)::int as n from emba_audit where person_id=$1 and action='plan:read'", [f.owner.personId])).rows[0].n;
  const open = async (tab?: string) => { for (const read of Object.values(reads)) read.mockClear(); const before = await recorded(); const page = await view(f.owner, tab); const out = { made: made(), recorded: await recorded() - before }; return { page, ...out }; };
  // Decisions, claims and outputs come from the header's reads: the list of groups, the team's state and its brief are the three reads recorded.
  for (const tab of [undefined, 'claims', 'outputs']) {
    const shown = await open(tab);
    expect([shown.made, shown.recorded], tab).toEqual([['listTeamEvents'], 3]);
    // The count of open asks is in the tab bar on every tab, without the asks being listed.
    expect(screen.getByRole('link', { name: 'Asks1' })).toHaveAttribute('href', '/groups/study-team/team?tab=asks');
    shown.page.unmount();
  }
  for (const [tab, extra, records] of [['asks', ['listAsks'], 4], ['brief', ['briefHistory'], 3], ['mine', ['myRecentRecords'], 4], ['events', ['archivedEvents', 'upcomingEvents'], 4]] as const) {
    const shown = await open(tab);
    expect([shown.made, shown.recorded], tab).toEqual([[...extra, 'listTeamEvents'].sort(), records]);
    if (tab === 'asks') expect(screen.getByText('Red or white?')).toBeInTheDocument();
    shown.page.unmount();
  }
});
it('shows the editing controls to an owner or organizer only, and the asking form to those who may post', async () => {
  const f = await fixture();
  const join = async (email: string, role: string) => { const p = await person(email); await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [f.scope.orgId, p.personId]); await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [f.scope.orgId, f.scope.loopId, p.personId, role]); return p; };
  const organizer = await join('organizer@example.test', 'organizer'), follower = await join('follower@example.test', 'follower');
  expect((await act(f.owner, () => addTeamEvent(idle, form({ ...f.ids, slug: 'final-deck', name: 'Final deck' })))).status).toBe('success');
  const controls = { decisions: 'Post announcement', brief: 'Save brief', events: 'Create event' };
  for (const [who, manages, posts] of [[organizer, true, true], [f.ana, false, true], [follower, false, false]] as const) {
    for (const [tab, name] of Object.entries(controls)) {
      const page = await view(who, tab);
      expect(screen.queryAllByRole('button', { name }).length > 0, `${tab} for ${who.verifiedEmail}`).toBe(manages);
      page.unmount();
    }
    const page = await view(who, 'asks');
    expect(screen.queryByRole('heading', { name: 'New ask' }) !== null, who.verifiedEmail!).toBe(posts);
    expect(screen.queryByText(/You follow this group and can read it/) !== null, who.verifiedEmail!).toBe(!posts);
    page.unmount();
  }
});
it('checks the role on every action, whatever the page showed', async () => {
  const f = await fixture();
  await claim(t.db, f.ana, { ...f.scope, what: 'Slides 4 to 8', owner: 'ben' });
  const denied = 'This change could not be saved. Check your access, reload the page and try again.';
  // A member cannot curate, and an outsider can do nothing, by posting the forms directly.
  for (const who of [f.ana, f.outsider]) {
    expect(await act(who, () => saveTeamBrief(idle, form({ ...f.ids, body: 'Mine now', expectedVersion: '0' })))).toEqual({ status: 'error', message: denied });
    expect(await act(who, () => announceToTeam(idle, form({ ...f.ids, text: 'From a member' })))).toEqual({ status: 'error', message: denied });
    expect(await act(who, () => addTeamEvent(idle, form({ ...f.ids, slug: 'mine', name: 'Mine' })))).toEqual({ status: 'error', message: denied });
  }
  expect(await act(f.outsider, () => amendTeamRecord(idle, form({ ...f.ids, number: '1', action: 'withdraw' })))).toEqual({ status: 'error', message: denied });
  expect(await act(f.ana, () => amendTeamRecord(idle, form({ ...f.ids, number: '1', action: 'confirm' })))).toEqual({ status: 'error', message: denied });
  expect((await saveTeamBrief(idle, form({ ...f.ids, body: 'No session', expectedVersion: '0' }))).message).toBe('Sign in to continue.');
  // The person it was proposed for confirms it; a second answer is told the record has moved on.
  expect(await act(f.ben, () => amendTeamRecord(idle, form({ ...f.ids, number: '1', action: 'confirm' })))).toEqual({ status: 'success', message: 'Saved.' });
  expect(await act(f.ben, () => amendTeamRecord(idle, form({ ...f.ids, number: '1', action: 'decline' })))).toEqual({ status: 'error', message: 'Not saved. This record changed after the page loaded. Reload the page to see how it stands now.' });
  expect(await act(f.owner, () => amendTeamRecord(idle, form({ ...f.ids, number: '1', action: 'withdraw' })))).toEqual({ status: 'success', message: 'Saved.' });
  expect((await t.db.query('select state from emba_team_record')).rows).toEqual([{ state: 'withdrawn' }]);
  expect((await t.db.query('select 1 from emba_team_brief')).rows).toEqual([]);
});
it('offers read, or read and write, per assistant and team, and says what write allows', async () => {
  const f = await fixture();
  for (const [name, value] of Object.entries({ LOOP_AUTH_CLIENT_IDS: 'claude-test', LOOP_AUTH_ISSUER: 'https://issuer.example', LOOP_AUTH_AUDIENCE: 'https://loop.example/api/mcp', LOOP_AUTH_JWKS_URL: 'https://issuer.example/jwks' })) vi.stubEnv(name, value);
  const scopeValue = `${f.scope.orgId}:${f.scope.loopId}`;
  expect((await act(f.ana, () => grantGroupRead(idle, form({ clientId: 'claude-test', scope: scopeValue })))).status).toBe('success');
  expect((await act(f.ben, () => grantGroupRead(idle, form({ clientId: 'claude-test', scope: scopeValue, access: 'write' })))).status).toBe('success');
  expect((await act(f.outsider, () => grantGroupRead(idle, form({ clientId: 'claude-test', scope: scopeValue, access: 'write' })))).status).toBe('error');
  expect((await act(f.ben, () => grantGroupRead(idle, form({ clientId: 'unknown-client', scope: scopeValue, access: 'write' })))).status).toBe('error');
  const { rows } = await t.db.query<{ person_id: string; actions: string[] }>('select person_id,actions from emba_lease order by created_at');
  expect(rows.map(row => [row.person_id, [...row.actions].sort()])).toEqual([[f.ana.personId, ['plan:read']], [f.ben.personId, ['group-memory:write', 'plan:read']]]);
  render(await withPortalTestSession(f.ben, () => ConnectionsPage()));
  expect(screen.getByText(/save decisions, outputs and claims under your name when you ask it to, with no further approval step/)).toBeInTheDocument();
  expect(screen.getByText(/Read and write · Active/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Renew for 30 days' })).toBeInTheDocument();
  cleanup();
  // Review gate 4.6. Choosing Read again replaces the write grant instead of sitting beside it.
  expect((await act(f.ben, () => grantGroupRead(idle, form({ clientId: 'claude-test', scope: scopeValue })))).status).toBe('success');
  const active = await t.db.query<{ id: string; actions: string[] }>('select id,actions from emba_lease where person_id=$1 and revoked_at is null', [f.ben.personId]);
  expect(active.rows.map(row => row.actions)).toEqual([['plan:read']]);
  // An assistant the deployment no longer admits cannot be renewed, and the page stops offering it.
  vi.stubEnv('LOOP_AUTH_CLIENT_IDS', 'another-client');
  expect((await act(f.ben, () => renewGroupRead(idle, form({ id: active.rows[0].id })))).status).toBe('error');
  render(await withPortalTestSession(f.ben, () => ConnectionsPage()));
  expect(screen.getByText(/Read · Active/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Renew for 30 days' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
});
it('tells an organizer why a brief was not saved, and keeps what they typed', async () => {
  const f = await fixture();
  const brief = (values: Record<string, string>) => act(f.owner, () => saveTeamBrief(idle, form({ ...f.ids, body: 'Ten slides.', expectedVersion: '0', ...values })));
  // Older and differently cased zone names are real zones.
  expect((await brief({ timezone: 'asia/kolkata' })).status).toBe('success');
  expect((await t.db.query('select timezone from emba_team_state')).rows).toEqual([{ timezone: expect.stringMatching(/^Asia\/(Kolkata|Calcutta)$/) }]);
  expect((await brief({ timezone: 'US/Eastern', expectedVersion: '1' })).status).toBe('success');
  expect((await brief({ expectedVersion: '1' })).message).toMatch(/^Not saved\. Someone else saved the brief while you were editing\. Your text is still in the box/);
  for (const bad of [{ timezone: 'Mars/Olympus' }, { timezone: '+05:30' }, { deadline: '2026-02-30' }, { body: 'x'.repeat(4001) }] as Record<string, string>[])
    expect((await brief({ expectedVersion: '2', ...bad })).message, JSON.stringify(bad).slice(0, 40)).toMatch(/^Not saved\. Check that the brief is at most 4,000 characters/);
  expect((await t.db.query('select count(*)::int as n from emba_team_brief')).rows).toEqual([{ n: 2 }]);
  // The editor holds its fields, so a refusal does not reset them.
  const refuse = vi.fn(async () => ({ status: 'error' as const, message: 'Not saved.' }));
  render(<BriefForm action={refuse} orgId={f.ids.orgId} loopId={f.ids.loopId} version={2} body="Ten slides." deadline="" timezone="UTC" />);
  const box = screen.getByLabelText(/^Brief/);
  fireEvent.change(box, { target: { value: 'Twelve slides, and an appendix.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save brief' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Not saved.');
  expect(refuse).toHaveBeenCalledOnce();
  expect(box).toHaveValue('Twelve slides, and an appendix.');
});
