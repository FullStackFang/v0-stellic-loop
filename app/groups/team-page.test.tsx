import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { retireGroupAddress } from '@/lib/emba/groups';
import { setMemberHandle } from '@/lib/emba/tags';
import { claim, fileOutput, logDecision } from '@/lib/emba/team-records';
import { createAsk, listAsks } from '@/lib/emba/team-asks';
import { listTeamEvents } from '@/lib/emba/team-events';
import { upcomingEvents } from '@/lib/emba/team-interest';
import { linkEvent } from '@/lib/emba/team-event-links';
import { addFeed } from '@/lib/emba/team-nearby';
import { briefHistory, myRecentRecords } from '@/lib/emba/team-read';
import TeamPage from './[namespace]/team/page';
import { addTeamEvent, amendTeamRecord, announceToTeam, saveTeamBrief, takeBackTeamEvent } from './team-actions';
import { disconnectAssistant, grantGroupRead, renewGroupRead, revokeGroupRead } from './connection-actions';
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

  // The team's name, its announcements and where it stands are beside every tab.
  let ben = await view(f.ben);
  expect(screen.getByRole('heading', { name: 'Study team' })).toBeInTheDocument();
  expect(screen.getByText(/Deck due Friday\./)).toBeInTheDocument();
  expect(screen.getByText(/Google Slides\./)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /2 open claims/ })).toHaveAttribute('href', '/groups/study-team/team?tab=claims');
  expect(screen.getByRole('link', { name: /1 output.*1 flagged/ })).toHaveAttribute('href', '/groups/study-team/team?tab=outputs');
  ben.unmount();
  ben = await view(f.ben, 'decisions');
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
  for (const tab of ['decisions', 'claims', 'outputs']) {
    const shown = await open(tab);
    expect([shown.made, shown.recorded], tab).toEqual([['listTeamEvents'], 3]);
    // The count of open asks is in the tab bar on every tab, without the asks being listed.
    expect(screen.getByRole('link', { name: 'Asks1' })).toHaveAttribute('href', '/groups/study-team/team?tab=asks');
    shown.page.unmount();
  }
  // The first tab, All, lays out what is coming up, so it also reads the asks, the upcoming events, the ideas and the travel.
  const all = await open();
  expect([all.made, all.recorded]).toEqual([['listAsks', 'listTeamEvents', 'upcomingEvents'], 7]);
  all.page.unmount();
  for (const [tab, extra, records] of [['asks', ['listAsks'], 4], ['brief', ['briefHistory'], 3], ['mine', ['myRecentRecords'], 4], ['events', ['archivedEvents', 'upcomingEvents'], 6]] as const) {
    const shown = await open(tab);
    expect([shown.made, shown.recorded], tab).toEqual([[...extra, 'listTeamEvents'].sort(), records]);
    if (tab === 'asks') expect(screen.getByText('Red or white?')).toBeInTheDocument();
    shown.page.unmount();
  }
});
it('opens on what is coming up, a column a day, and marks what waits on the reader', async () => {
  const f = await fixture();
  const day = (plus: number) => new Date(Date.now() + plus * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'America/New_York' });
  expect((await act(f.owner, () => saveTeamBrief(idle, form({ ...f.ids, body: 'Final deck.', deadline: day(20), timezone: 'America/New_York', expectedVersion: '0' })))).status).toBe('success');
  await logDecision(t.db, f.ana, { ...f.scope, topic: 'deck-tool', statement: 'Google Slides.', newTopic: true });
  await claim(t.db, f.ana, { ...f.scope, what: 'Slides 4 to 8', owner: 'ben' });
  await claim(t.db, f.ben, { ...f.scope, what: 'Slides 1 to 3', dueOn: day(1) });
  expect((await createAsk(t.db, f.ana, { ...f.scope, question: 'Red or white?', kind: 'one', options: ['Red', 'White'], closesAt: new Date(Date.now() + 86_400_000).toISOString().slice(0, 19) + 'Z' })).saved).toBe(true);
  await view(f.ben);
  const column = (name: string) => within(screen.getByRole('region', { name }));
  // Asked of him today: he can take it or pass from the card. His own claim and the open ask fall on tomorrow.
  expect(column('Today').getByText('Take it or pass')).toBeInTheDocument();
  expect(column('Today').getByRole('button', { name: 'Confirm: I will do this' })).toBeInTheDocument();
  expect(column('Today').getByText(/1 thing/)).toHaveTextContent('1 needs you');
  expect(column('Tomorrow').getByText(/^Yours, due/)).toBeInTheDocument();
  expect(column('Tomorrow').getByText('Needs your answer')).toBeInTheDocument();
  expect(column('Tomorrow').getByRole('link', { name: 'Red or white?' })).toBeInTheDocument();
  // What is settled is one line each, and opens where it is kept.
  expect(screen.getByRole('link', { name: 'Google Slides.' })).toHaveAttribute('href', '/groups/study-team/team?tab=decisions#r1');
  cleanup();
  // Ana asked and has answered nothing either, but nothing was asked of her as a claim.
  await view(f.ana);
  expect(screen.queryByText('Take it or pass')).not.toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Tomorrow' })).getByText('Needs your answer')).toBeInTheDocument();
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
  expect((await act(f.ana, () => grantGroupRead(idle, form({ clientId: 'claude-test', scope: scopeValue })))).message).toMatch(/^Saved\. claude-test can read .+ until [A-Z][a-z]{2} \d{1,2}\.$/);
  expect((await act(f.ben, () => grantGroupRead(idle, form({ clientId: 'claude-test', scope: scopeValue, access: 'write' })))).message).toMatch(/^Saved\. claude-test can read and write .+ until [A-Z][a-z]{2} \d{1,2}\.$/);
  expect((await act(f.outsider, () => grantGroupRead(idle, form({ clientId: 'claude-test', scope: scopeValue, access: 'write' })))).status).toBe('error');
  expect((await act(f.ben, () => grantGroupRead(idle, form({ clientId: 'unknown-client', scope: scopeValue, access: 'write' })))).status).toBe('error');
  const { rows } = await t.db.query<{ person_id: string; actions: string[] }>('select person_id,actions from emba_lease order by created_at');
  expect(rows.map(row => [row.person_id, [...row.actions].sort()])).toEqual([[f.ana.personId, ['plan:read']], [f.ben.personId, ['group-memory:write', 'plan:read']]]);
  // The assistant form shows only where sign-in is configured.
  for (const [name, value] of Object.entries({ LOOP_AUTH_PROVIDER: 'clerk', CLERK_SECRET_KEY: 'sk_test_x', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_bG9vcC5leGFtcGxlLmNvbSQ=', LOOP_AUTH_ISSUER: 'https://loop.example.com' })) vi.stubEnv(name, value);
  render(await withPortalTestSession(f.ben, () => ConnectionsPage()));
  expect(screen.getByText(/It writes only when you ask, with no further approval step/)).toBeInTheDocument();
  expect(screen.getByText('It can also save, correct and withdraw records under your name when you ask.')).toBeInTheDocument();
  const row = within(document.querySelector('.lp-grant') as HTMLElement);
  expect(row.getByText('Read and write')).toBeInTheDocument();
  expect(row.getByText(/^Ends [A-Z][a-z]{2} \d{1,2}$/)).toBeInTheDocument();
  expect(row.getByText(/^\d+ days? left$/)).toBeInTheDocument();
  expect(row.getByText('claude-test')).toBeInTheDocument();
  expect(row.getByText(/^@/)).toBeInTheDocument();
  expect(document.querySelector('.lp-grants')!.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}/);
  const radios = screen.getAllByRole('radio', { name: /^Read/ });
  expect(radios.map(radio => [(radio as HTMLInputElement).value, (radio as HTMLInputElement).checked])).toEqual([['read', true], ['write', false]]);
  expect(screen.getByRole('radiogroup', { name: 'Access' })).toBeInTheDocument();
  expect(screen.getByText('What each level allows')).toBeInTheDocument();
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
  expect(within(document.querySelector('.lp-grant') as HTMLElement).getByText('Read')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Renew for 30 days' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
  vi.stubEnv('LOOP_AUTH_CLIENT_IDS', 'claude-test');
  expect((await act(f.ben, () => renewGroupRead(idle, form({ id: active.rows[0].id })))).message).toMatch(/^Renewed until [A-Z][a-z]{2} \d{1,2}\.$/);
  const renewed = await t.db.query<{ id: string }>('select id from emba_lease where person_id=$1 and revoked_at is null', [f.ben.personId]);
  expect((await act(f.ben, () => revokeGroupRead(idle, form({ id: renewed.rows[0].id })))).status).toBe('success');
  // Disconnecting ends every team grant the person gave that assistant, and says where its sign-in is cleared.
  expect((await act(f.ben, () => grantGroupRead(idle, form({ clientId: 'claude-test', scope: scopeValue })))).status).toBe('success');
  expect((await act(f.ben, () => disconnectAssistant(idle, form({ clientId: 'claude-test' })))).message).toBe('claude-test can no longer reach your teams. To clear its sign-in too, remove the Loop connector in claude-test.');
  expect((await t.db.query('select 1 from emba_lease where person_id=$1 and revoked_at is null', [f.ben.personId])).rows).toEqual([]);
});
it('stops listing a grant once its group is gone, and names the assistant the provider registered', async () => {
  const f = await fixture();
  for (const [name, value] of Object.entries({ LOOP_AUTH_CLIENT_IDS: 'oJLiBHFWfm5De8eq', LOOP_AUTH_AUDIENCE: 'https://loop.example/api/mcp', LOOP_AUTH_JWKS_URL: 'https://issuer.example/jwks', LOOP_AUTH_PROVIDER: 'clerk', CLERK_SECRET_KEY: 'sk_test_x', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_bG9vcC5leGFtcGxlLmNvbSQ=', LOOP_AUTH_ISSUER: 'https://loop.example.com' })) vi.stubEnv(name, value);
  expect((await act(f.ben, () => grantGroupRead(idle, form({ clientId: 'oJLiBHFWfm5De8eq', scope: `${f.scope.orgId}:${f.scope.loopId}`, access: 'write' })))).message).toMatch(/^Saved\. Muse can read and write /);
  render(await withPortalTestSession(f.ben, () => ConnectionsPage()));
  expect(within(document.querySelector('.lp-grant') as HTMLElement).getByText('Muse')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Muse' })).toHaveValue('oJLiBHFWfm5De8eq');
  expect(document.body.textContent).not.toContain('oJLiBHFWfm5De8eq');
  // One line carries everything Muse needs, and a granted Muse can be disconnected in one press.
  expect(screen.getByLabelText('Line to paste into Muse')).toHaveValue('Connect to Loop at https://loop.example/api/mcp/team with client ID oJLiBHFWfm5De8eq');
  expect(screen.getByRole('button', { name: 'Disconnect Muse' })).toBeInTheDocument();
  cleanup();
  // A link that names an admitted assistant opens the form with it chosen; any other name is ignored.
  vi.stubEnv('LOOP_AUTH_CLIENT_IDS', 'claude-test,oJLiBHFWfm5De8eq');
  render(await withPortalTestSession(f.ben, () => ConnectionsPage({ searchParams: Promise.resolve({ assistant: 'oJLiBHFWfm5De8eq' }) })));
  expect(screen.getByRole('combobox', { name: 'Assistant' })).toHaveValue('oJLiBHFWfm5De8eq');
  cleanup();
  render(await withPortalTestSession(f.ben, () => ConnectionsPage({ searchParams: Promise.resolve({ assistant: 'unknown-client' }) })));
  expect(screen.getByRole('combobox', { name: 'Assistant' })).toHaveValue('claude-test');
  cleanup();
  await retireGroupAddress(t.db, f.owner, f.scope);
  render(await withPortalTestSession(f.ben, () => ConnectionsPage()));
  expect(document.querySelector('.lp-grant')).toBeNull();
  expect(screen.queryByText('Group no longer available')).not.toBeInTheDocument();
  expect(screen.getByText(/No assistant can reach your teams yet/)).toBeInTheDocument();
  // The person is told once, in plain words, which grant ended and why.
  const ended = document.querySelector('.lp-grants-ended') as HTMLElement;
  expect(ended).toHaveAttribute('role', 'status');
  expect(ended.textContent).toMatch(/^Study team was removed on [A-Z][a-z]{2} \d{1,2}\. Muse can no longer reach it\.$/);
  cleanup();
  render(await withPortalTestSession(f.ana, () => ConnectionsPage()));
  expect(document.querySelector('.lp-grants-ended')).toBeNull();
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

// Events from a link and from nearby (loop-group-event-links): who sees which control. Nothing here reaches the network.
const inTwoDays = new Date(Math.floor(Date.now() / 3600000) * 3600000 + 2 * 86400000), ics = (at: Date) => at.toISOString().replace(/[-:]|\.\d{3}/g, '');
const feedText = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Pitch night', `DTSTART:${ics(inTwoDays)}`, `DTEND:${ics(new Date(+inTwoDays + 7200000))}`, 'LOCATION:Sage Hall', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
const club = { fetch: (async () => new Response(feedText, { headers: { 'content-type': 'text/calendar' } })) as unknown as typeof globalThis.fetch, lookup: async () => ['93.184.216.34'] };
const dinner = async () => ({ ok: true as const, facts: { name: 'Founders dinner', startsAt: '2099-01-15T23:00:00.000Z', endsAt: null, place: '40 E 1st St', host: null } });
async function joinAs(f: Awaited<ReturnType<typeof fixture>>, email: string, role: string) { const p = await person(email); await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [f.scope.orgId, p.personId]); await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [f.scope.orgId, f.scope.loopId, p.personId, role]); return p; }
it('shows the paste box to members who can post and not to followers', async () => {
  const f = await fixture(), follower = await joinAs(f, 'follower@example.test', 'follower');
  for (const [who, sees] of [[f.ana, true], [f.owner, true], [follower, false]] as const) {
    const page = await view(who, 'events');
    expect(screen.queryByLabelText('Add an event from a link') !== null, who.verifiedEmail!).toBe(sees);
    expect(screen.queryByRole('button', { name: 'Add event' }) !== null, who.verifiedEmail!).toBe(sees);
    page.unmount();
  }
});
it('lists Nearby only when a feed has items, with one control for members who can post', async () => {
  const f = await fixture(), follower = await joinAs(f, 'follower@example.test', 'follower');
  let page = await view(f.ana, 'events');
  expect(screen.queryByRole('heading', { name: 'Nearby' })).not.toBeInTheDocument();
  page.unmount();
  expect(await addFeed(t.db, f.owner, { ...f.ids, name: 'Entrepreneurship Club', url: 'https://club.example.org/feed.ics' }, club)).toMatchObject({ saved: true });
  page = await view(f.ana, 'events');
  expect(screen.getByRole('heading', { name: 'Nearby' })).toBeInTheDocument();
  expect(screen.getByText('Pitch night')).toBeInTheDocument();
  expect(screen.getByText('Sage Hall')).toBeInTheDocument();
  expect(screen.getByText('Entrepreneurship Club')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: "I'm interested" })).toHaveLength(1);
  page.unmount();
  page = await view(follower, 'events');
  expect(screen.getByText('Pitch night')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: "I'm interested" })).not.toBeInTheDocument();
});
it('shows the Feeds block to owners and organizers only', async () => {
  const f = await fixture(), organizer = await joinAs(f, 'organizer@example.test', 'organizer'), follower = await joinAs(f, 'follower@example.test', 'follower');
  expect(await addFeed(t.db, f.owner, { ...f.ids, name: 'Entrepreneurship Club', url: 'https://club.example.org/feed.ics' }, club)).toMatchObject({ saved: true });
  for (const [who, sees] of [[f.owner, true], [organizer, true], [f.ana, false], [follower, false]] as const) {
    const page = await view(who, 'events');
    expect(screen.queryByRole('heading', { name: 'Feeds' }) !== null, who.verifiedEmail!).toBe(sees);
    expect(screen.queryByRole('button', { name: 'Read now' }) !== null, who.verifiedEmail!).toBe(sees);
    expect(screen.queryByText('https://club.example.org/feed.ics') !== null, who.verifiedEmail!).toBe(sees);
    page.unmount();
  }
});
it('lets the member who linked an event take it back, and only that member', async () => {
  const f = await fixture();
  expect(await linkEvent(t.db, f.ana, { ...f.ids, url: 'https://lu.ma/dinner' }, dinner)).toMatchObject({ saved: true, existing: false });
  let page = await view(f.ben, 'events');
  expect(screen.getAllByText('Founders dinner').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: 'Remove this event' })).not.toBeInTheDocument();
  page.unmount();
  page = await view(f.ana, 'events');
  expect(screen.getAllByRole('button', { name: 'Remove this event' })).toHaveLength(1);
  page.unmount();
  expect(await act(f.ben, () => takeBackTeamEvent(idle, form({ ...f.ids, event: 'founders-dinner' })))).toEqual({ status: 'error', message: 'Not saved. Only the member who added this event can take it back.' });
  expect(await act(f.ana, () => takeBackTeamEvent(idle, form({ ...f.ids, event: 'founders-dinner' })))).toEqual({ status: 'success', message: 'Removed.' });
  page = await view(f.ana, 'events');
  expect(screen.queryByText('Founders dinner')).not.toBeInTheDocument();
  expect(screen.getByText('No upcoming events.')).toBeInTheDocument();
});
