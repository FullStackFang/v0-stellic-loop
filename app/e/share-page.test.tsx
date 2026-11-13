import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { setMemberHandle } from '@/lib/emba/tags';
import { enableAccessRequests, setJoinMode } from '@/lib/emba/access-requests';
import { addEvent } from '@/lib/emba/team-events';
import TeamPage from '../groups/[namespace]/team/page';
import SharedEventPage, { generateMetadata } from './[token]/page';
import { addTeamEvent, changeTeamEvent, setTeamInterest } from '../groups/team-actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

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
  const group = await createWorkspace(t.db, owner, { name: 'Hiking club', description: '', namespace: 'hiking-club' });
  const scope = { orgId: group.orgId, loopId: group.loopId };
  const join = async (email: string, handle: string) => {
    const member = await person(email);
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [group.orgId, member.personId]);
    await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [group.orgId, group.loopId, member.personId]);
    await setMemberHandle(t.db, member, { orgId: group.orgId, handle });
    return member;
  };
  const ana = await join('ana@example.test', 'ana'), ben = await join('ben@example.test', 'ben'), outsider = await person('outsider@example.test');
  const added = await addEvent(t.db, owner, { ...scope, slug: 'ridge-walk', name: 'Ridge walk', startsAt: '2099-03-05T18:30', place: 'Trailhead car park', url: 'https://trails.example.org/ridge', note: 'Bring boots and a flask' });
  if (!added.saved) throw new Error('fixture event not saved');
  const { rows: [{ share_token: token }] } = await t.db.query<{ share_token: string }>('select share_token from emba_team_event');
  return { owner, ana, ben, outsider, scope, ids: scope, token };
}
const as = <T,>(principal: Principal | null, run: () => T) => principal ? withPortalTestSession(principal, run) : run();
const team = async (principal: Principal) => render(await withPortalTestSession(principal, () => TeamPage({ params: Promise.resolve({ namespace: 'hiking-club' }), searchParams: Promise.resolve({ tab: 'events' }) })));
const share = async (principal: Principal | null, token: string) => render(await as(principal, () => SharedEventPage({ params: Promise.resolve({ token }) })));

it('lists upcoming events on the team page with date, place, who is interested, and one interest control', async () => {
  const f = await fixture();
  expect((await as(f.ana, () => setTeamInterest(idle, form({ ...f.ids, event: 'ridge-walk', interested: 'true', route: 'site' })))).status).toBe('success');
  expect((await as(f.ben, () => setTeamInterest(idle, form({ ...f.ids, event: 'ridge-walk', interested: 'true', route: 'site' })))).status).toBe('success');
  await team(f.ben);
  expect(screen.getByRole('heading', { name: 'Upcoming events' })).toBeInTheDocument();
  expect(screen.getByText(/5 Mar 2099, 18:30/)).toBeInTheDocument();
  expect(screen.getByText('Trailhead car park')).toBeInTheDocument();
  expect(screen.getByText('Bring boots and a flask')).toBeInTheDocument();
  expect(screen.getByText(/^2 interested: You, /)).toBeInTheDocument();
  // He is already interested, so the one control takes it back.
  expect(screen.getByRole('button', { name: 'Take back my interest' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: "I'm interested" })).not.toBeInTheDocument();
  const whatsapp = screen.getByRole('link', { name: 'Send to WhatsApp' });
  expect(whatsapp.getAttribute('href')).toBe(`https://wa.me/?text=${encodeURIComponent(`Ridge walk\nhttps://board.test/e/${f.token}`)}`);
  expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  // A member who has not marked interest is offered the mark; only organizers see the event controls.
  cleanup();
  await t.db.query('delete from emba_event_interest where person_id=$1', [f.ben.personId]);
  await team(f.ben);
  expect(screen.getByRole('button', { name: "I'm interested" })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create event' })).not.toBeInTheDocument();
});

it('lets an organizer set an event\'s time, place, link and note, and says why a write is refused', async () => {
  const f = await fixture();
  const { rows: [{ id }] } = await t.db.query<{ id: string }>('select id from emba_team_event');
  const base = { orgId: f.scope.orgId, eventId: id, slug: 'ridge-walk', name: 'Ridge walk' };
  expect((await as(f.owner, () => changeTeamEvent(idle, form({ ...base, startsAt: '2099-03-05T18:30', endsAt: '2099-03-05T20:00', place: 'Summit', url: '', note: '' })))).status).toBe('success');
  expect((await t.db.query('select place,url,note from emba_team_event')).rows).toEqual([{ place: 'Summit', url: null, note: null }]);
  expect((await as(f.owner, () => changeTeamEvent(idle, form({ ...base, startsAt: '2099-03-05T18:30', endsAt: '2099-03-05T17:00' })))).message).toBe('Not saved. The end time is earlier than the start time.');
  expect((await as(f.owner, () => changeTeamEvent(idle, form({ ...base, url: 'http://plain.example.org' })))).message).toMatch(/^Not saved\. The link was refused: it must be an https link/);
  expect((await as(f.owner, () => addTeamEvent(idle, form({ ...f.ids, slug: 'ridge-walk', name: 'Again' })))).message).toMatch(/^Not saved\. That tag is already used/);
  expect((await as(f.ben, () => addTeamEvent(idle, form({ ...f.ids, slug: 'mine', name: 'Mine' })))).message).toBe('This change could not be saved. Check your access, reload the page and try again.');
});

it('shows a signed-in non-member and a signed-out visitor only the outside view, with no name, note or link', async () => {
  const f = await fixture();
  await as(f.ana, () => setTeamInterest(idle, form({ ...f.ids, event: 'ridge-walk', interested: 'true', route: 'site' })));
  for (const visitor of [f.outsider, null]) {
    const view = await share(visitor, f.token);
    expect(screen.getByRole('heading', { name: 'Ridge walk' })).toBeInTheDocument();
    expect(screen.getByText('Hiking club')).toBeInTheDocument();
    expect(screen.getByText(/5 Mar 2099, 18:30/)).toBeInTheDocument();
    expect(screen.getByText('Trailhead car park')).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/ana|Bring boots|trails\.example\.org|interested/i);
    expect(screen.queryByRole('button', { name: /interested/i })).not.toBeInTheDocument();
    view.unmount();
  }
  // Signed out: a way to sign in. Signed in with no join link on: nothing to press.
  await share(f.outsider, f.token);
  expect(screen.queryByRole('button', { name: /join/i })).not.toBeInTheDocument();
});

it('offers the join step to a signed-in non-member in the group\'s join mode', async () => {
  const f = await fixture();
  await enableAccessRequests(t.db, f.owner, { ...f.scope, publicLabel: 'Hiking club' });
  await share(f.outsider, f.token);
  expect(screen.getByRole('button', { name: 'Request to join' })).toBeInTheDocument();
  cleanup();
  await setJoinMode(t.db, f.owner, { ...f.scope, mode: 'admit' });
  await share(f.outsider, f.token);
  expect(screen.getByRole('button', { name: 'Join group' })).toBeInTheDocument();
});

it('builds the link preview from the outside view alone, and never indexes the page', async () => {
  const f = await fixture();
  await as(f.ana, () => setTeamInterest(idle, form({ ...f.ids, event: 'ridge-walk', interested: 'true', route: 'site' })));
  const meta = await generateMetadata({ params: Promise.resolve({ token: f.token }) });
  expect(meta.title).toBe('Ridge walk · Hiking club');
  expect(meta.robots).toEqual({ index: false, follow: false });
  expect(meta.description).toContain('Trailhead car park');
  expect(JSON.stringify(meta)).not.toMatch(/ana|ben|Bring boots|trails\.example\.org|interested/i);
  expect(await generateMetadata({ params: Promise.resolve({ token: '0'.repeat(32) }) })).toEqual({ robots: { index: false, follow: false } });
});

it('shows a member the event with the interest control, and renders not-found for an unknown token', async () => {
  const f = await fixture();
  await share(f.ben, f.token);
  expect(screen.getByText('Bring boots and a flask')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: "I'm interested" })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open the team page' })).toHaveAttribute('href', '/groups/hiking-club/team?tab=events');
  expect((await as(f.ben, () => setTeamInterest(idle, form({ ...f.ids, event: 'ridge-walk', interested: 'true', route: 'share_link' })))).status).toBe('success');
  expect((await t.db.query('select route from emba_event_interest')).rows).toEqual([{ route: 'share_link' }]);
  await expect(SharedEventPage({ params: Promise.resolve({ token: '0'.repeat(32) }) })).rejects.toThrow();
});
