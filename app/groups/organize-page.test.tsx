import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { grantLease } from '@/lib/emba/consent';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { setMemberHandle } from '@/lib/emba/tags';
import { answerAsk, createAsk } from '@/lib/emba/team-asks';
import { addEvent } from '@/lib/emba/team-events';
import { setInterest } from '@/lib/emba/team-interest';
import { interestByDay } from '@/lib/emba/team-organize';
import { saveBrief } from '@/lib/emba/team-read';
import OrganizePage from './[namespace]/organize/page';
import { announceToTeam } from './team-actions';

// Specs: openspec/changes/loop-club-reach/specs/organizer-view.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from emba_deletion_tombstone'); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const idle = { status: 'idle' as const, message: '' };
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
async function person(email: string, name: string) {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
async function fixture() {
  const owner = await person('owner@example.test', 'Olive Owner');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://loop.test');
  const group = await createWorkspace(t.db, owner, { name: 'Hiking club', description: '', namespace: 'hiking-club' });
  const scope = { orgId: group.orgId, loopId: group.loopId };
  const join = async (email: string, name: string, handle: string) => {
    const member = await person(email, name);
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [group.orgId, member.personId]);
    await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [group.orgId, group.loopId, member.personId]);
    await setMemberHandle(t.db, member, { orgId: group.orgId, handle });
    return member;
  };
  const ana = await join('ana@example.test', 'Ana Alvarez', 'ana'), ben = await join('ben@example.test', 'Ben Brook', 'ben'), cy = await join('cy@example.test', 'Cy Cole', 'cy');
  await saveBrief(t.db, owner, { ...scope, body: 'We walk.', timezone: 'UTC', expectedVersion: 0 });
  const added = await addEvent(t.db, owner, { ...scope, slug: 'ridge-walk', name: 'Ridge walk', startsAt: '2099-03-05T18:30' });
  if (!added.saved) throw new Error('fixture event not saved');
  // The event was added three days ago; two members marked interest two days ago and one today.
  await t.db.query("update emba_team_event set created_at=clock_timestamp()-interval '3 days'");
  for (const member of [ana, ben, cy]) await setInterest(t.db, member, { ...scope, event: 'ridge-walk', interested: true });
  await t.db.query("update emba_event_interest set at=clock_timestamp()-interval '2 days' where person_id=any($1::uuid[])", [[ana.personId, ben.personId]]);
  const asked = await createAsk(t.db, owner, { ...scope, question: 'Boots or trainers?', kind: 'one', options: ['Boots', 'Trainers'], closesAt: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 19) + 'Z' });
  if (!asked.saved) throw new Error('fixture ask not saved');
  await answerAsk(t.db, ana, { ...scope, number: asked.ask.number, choices: ['Boots'] });
  return { owner, ana, ben, cy, scope };
}
const page = async (principal: Principal) => render(await withPortalTestSession(principal, () => OrganizePage({ params: Promise.resolve({ namespace: 'hiking-club' }) })));

it('shows an organizer interest by day and answers against expected, with no row per member', async () => {
  const f = await fixture();
  expect((await interestByDay(t.db, f.owner, f.scope)).events).toMatchObject([{ slug: 'ridge-walk', name: 'Ridge walk', interested: 3, days: [{ count: 0 }, { count: 2 }, { count: 2 }, { count: 3 }] }]);
  await page(f.owner);
  expect(screen.getByRole('heading', { name: 'Ridge walk' })).toBeInTheDocument();
  expect(screen.getByText(/3 interested now/)).toBeInTheDocument();
  expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual(['0', '2', '2', '3']);
  expect(screen.getByRole('link', { name: 'Boots or trainers?' }).getAttribute('href')).toMatch(/^\/a\/[0-9a-f]{32}$/);
  expect(screen.getByText(/^1 of 4 answered · closes /)).toBeInTheDocument();
  // Counts only: no member is named, by name or handle, and nothing says who has or has not answered.
  expect(document.body.textContent).not.toMatch(/Ana|Ben|Cy Cole|@hiking-club\/|not answered|still to answer/);
  // Taking interest back lowers today's count; a member who has left is not counted.
  await setInterest(t.db, f.cy, { ...f.scope, event: 'ridge-walk', interested: false });
  await t.db.query('update emba_role set revoked_at=now() where person_id=$1', [f.ben.personId]);
  expect((await interestByDay(t.db, f.owner, f.scope)).events[0]).toMatchObject({ interested: 1, days: [{ count: 0 }, { count: 1 }, { count: 1 }, { count: 1 }] });
});

it('is for owners and organizers on the site only', async () => {
  const f = await fixture();
  await page(f.ana);
  expect(screen.getByRole('heading', { name: 'Organizer view unavailable' })).toBeInTheDocument();
  expect(screen.queryByText(/interested now/)).not.toBeInTheDocument();
  await expect(interestByDay(t.db, f.ana, f.scope)).rejects.toThrow('forbidden');
  await grantLease(t.db, f.owner, { ...f.scope, clientId: 'claude', actions: ['plan:read', 'group-memory:write'], expiresAt: '2098-01-01T00:00:00Z' });
  const agent = (await authenticate(t.db, 'test', async () => ({ issuer: f.owner.issuer, subject: f.owner.subject, clientId: 'claude', scopes: ['plan:read', 'group-memory:write'], expiresAt: Date.parse('2098-01-01') })))!;
  await expect(interestByDay(t.db, agent, f.scope)).rejects.toThrow('forbidden');
});

it('posts an announcement from the view and sends it only when ticked', async () => {
  const f = await fixture();
  vi.stubEnv('LOOP_REACH_SENDING', 'on');
  await page(f.owner);
  expect(screen.getByRole('checkbox', { name: 'Send to members' })).not.toBeChecked();
  const post = (values: Record<string, string>) => withPortalTestSession(f.owner, () => announceToTeam(idle, form({ ...f.scope, ...values })));
  expect(await post({ text: 'Meet at the car park.' })).toMatchObject({ status: 'success' });
  expect((await t.db.query("select 1 from emba_reach_message where kind='announcement'")).rows).toEqual([]);
  expect(await post({ text: 'Walk moved to Sunday.', send: 'true' })).toMatchObject({ status: 'success' });
  expect((await t.db.query("select 1 from emba_reach_message where kind='announcement'")).rows).toHaveLength(3);
  // A member cannot announce, ticked or not.
  expect(await withPortalTestSession(f.ana, () => announceToTeam(idle, form({ ...f.scope, text: 'Hello', send: 'true' })))).toMatchObject({ status: 'error' });
});
