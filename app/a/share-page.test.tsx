import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { createWorkspace } from '@/lib/emba/workspaces';
import { setMemberHandle } from '@/lib/emba/tags';
import { createAsk, type AskResult } from '@/lib/emba/team-asks';
import { nameOf } from '@/components/emba/ask-parts';
import TeamPage from '../groups/[namespace]/team/page';
import SharedAskPage, { generateMetadata } from './[token]/page';
import { answerTeamAsk, closeTeamAsk } from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from emba_deletion_tombstone'); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const idle = { status: 'idle' as const, message: '' };
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
async function person(email: string, name = 'P') {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
const soon = () => new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 16);
async function fixture() {
  const owner = await person('owner@example.test');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  const group = await createWorkspace(t.db, owner, { name: 'Hiking club', description: '', namespace: 'hiking-club' });
  const scope = { orgId: group.orgId, loopId: group.loopId };
  const join = async (email: string, handle: string, name: string) => {
    const member = await person(email, name);
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [group.orgId, member.personId]);
    await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [group.orgId, group.loopId, member.personId]);
    await setMemberHandle(t.db, member, { orgId: group.orgId, handle });
    return member;
  };
  const ana = await join('ana@example.test', 'ana', 'Ana Smith'), ben = await join('ben@example.test', 'ben', 'Ben Jones'), outsider = await person('outsider@example.test');
  const ask = async (asker: Principal, reveal: 'named' | 'counts', question = 'Which weekend works?'): Promise<AskResult> => {
    const made = await createAsk(t.db, asker, { ...scope, question, kind: 'one', options: ['Saturday hike', 'Sunday picnic'], closesAt: soon(), reveal });
    if (!made.saved) throw new Error('fixture ask not saved');
    return made.ask;
  };
  return { owner, ana, ben, outsider, scope, ids: scope, ask };
}
const as = <T,>(principal: Principal | null, run: () => T) => principal ? withPortalTestSession(principal, run) : run();
const tokenOf = (ask: AskResult) => new URL(ask.shareUrl).pathname.split('/').pop()!;
const share = async (principal: Principal | null, ask: AskResult) => render(await as(principal, () => SharedAskPage({ params: Promise.resolve({ token: tokenOf(ask) }) })));
const answer = (principal: Principal, ids: { orgId: string; loopId: string }, ask: AskResult, choice: string) => as(principal, () => answerTeamAsk(idle, form({ ...ids, number: String(ask.number), choice, route: 'share_link' })));

it('shows the outside view and the link preview the question and closing time and nothing about answers', async () => {
  const f = await fixture();
  const ask = await f.ask(f.ana, 'named');
  expect((await answer(f.ben, f.ids, ask, '1')).status).toBe('success');
  for (const visitor of [f.outsider, null]) {
    const view = await share(visitor, ask);
    expect(screen.getByRole('heading', { name: 'Which weekend works?' })).toBeInTheDocument();
    expect(screen.getByText('Hiking club')).toBeInTheDocument();
    expect(screen.getByText(/^Closes /)).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/Saturday|Sunday|Ana Smith|Ben Jones|\d of \d|answered/i);
    view.unmount();
  }
  const meta = await generateMetadata({ params: Promise.resolve({ token: tokenOf(ask) }) });
  expect(meta.title).toBe('Which weekend works? · Hiking club');
  expect(meta.robots).toEqual({ index: false, follow: false });
  expect(meta.description).toMatch(/^Closes /);
  expect(JSON.stringify(meta)).not.toMatch(/Saturday|Sunday|Ana Smith|Ben Jones|answered/i);
  expect(await generateMetadata({ params: Promise.resolve({ token: '0'.repeat(32) }) })).toEqual({ robots: { index: false, follow: false } });
  await expect(SharedAskPage({ params: Promise.resolve({ token: '0'.repeat(32) }) })).rejects.toThrow();
});

it('shows a member of a named ask who chose what, and of a counts ask totals with no name even to the asker', async () => {
  const f = await fixture();
  const named = await f.ask(f.ana, 'named');
  await answer(f.ben, f.ids, named, '1');
  await share(f.ana, named);
  expect(screen.getByText(/^Saturday hike: 1 \(.*Ben Jones.*\)$/)).toBeInTheDocument();
  expect(screen.getByText('Sunday picnic: 0')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Take back my answer' })).not.toBeInTheDocument();
  cleanup();
  // Someone who has left is never named.
  expect(nameOf({ handle: null, isYou: false, former: true, name: 'Ben Jones' })).toBe('a former teammate');
  await share(f.ben, named);
  expect(screen.getByText('Your answer: Saturday hike')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Take back my answer' })).toBeInTheDocument();
  cleanup();
  const counts = await f.ask(f.ana, 'counts', 'Which snack?');
  await answer(f.ben, f.ids, counts, '2');
  await share(f.ana, counts);
  expect(screen.getByText('Sunday picnic: 1')).toBeInTheDocument();
  expect(screen.getByText('Saturday hike: 0')).toBeInTheDocument();
  const results = screen.getByRole('heading', { name: 'Results' }).parentElement!;
  expect(results.textContent).not.toMatch(/Ben Jones|\(/);
});

it('lists who has not answered for the asker only, and the reminder names nobody', async () => {
  const f = await fixture();
  const ask = await f.ask(f.ana, 'named');
  await answer(f.ana, f.ids, ask, '1');
  await share(f.ana, ask);
  const missing = screen.getByRole('heading', { name: 'Who has not answered' }).parentElement!;
  expect(missing.textContent).toMatch(/Ben Jones/);
  const reminder = screen.getByText(/still to answer by/);
  expect(reminder.textContent).not.toMatch(/Ana Smith|Ben Jones|\bana\b|\bben\b/i);
  const links = screen.getAllByRole('link', { name: 'Send to WhatsApp' }).map(link => link.getAttribute('href'));
  expect(links).toContain(`https://wa.me/?text=${encodeURIComponent(reminder.textContent!)}`);
  expect(screen.getByRole('button', { name: 'Close this ask now' })).toBeInTheDocument();
  cleanup();
  await share(f.ben, ask);
  expect(screen.queryByRole('heading', { name: 'Who has not answered' })).not.toBeInTheDocument();
  expect(screen.queryByText(/still to answer by/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Close this ask now' })).not.toBeInTheDocument();
  expect(screen.getByText(/1 of \d+ answered/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send my answer' })).toBeInTheDocument();
});

it('closes an ask for the asker, says why a late answer is refused, and refuses a stranger', async () => {
  const f = await fixture();
  const ask = await f.ask(f.ana, 'named');
  expect((await as(f.ben, () => closeTeamAsk(idle, form({ ...f.ids, number: String(ask.number) })))).message).toBe('Not saved. Only the person who asked, or an owner or organizer, can do this.');
  expect((await as(f.ana, () => closeTeamAsk(idle, form({ ...f.ids, number: String(ask.number) })))).status).toBe('success');
  expect((await answer(f.ben, f.ids, ask, '1')).message).toBe('Not saved. This ask has closed and takes no more answers.');
});

it('lists an open ask on the team page with its count and the caller\'s own answer', async () => {
  const f = await fixture();
  const ask = await f.ask(f.ana, 'named');
  await answer(f.ben, f.ids, ask, '2');
  render(await withPortalTestSession(f.ben, () => TeamPage({ params: Promise.resolve({ namespace: 'hiking-club' }), searchParams: Promise.resolve({ tab: 'asks' }) })));
  expect(screen.getByRole('heading', { name: 'Open asks' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Which weekend works?' })).toHaveAttribute('href', `/a/${tokenOf(ask)}`);
  expect(screen.getByText(/^1 of \d+ answered$/)).toBeInTheDocument();
  expect(screen.getByText('Your answer: Sunday picnic')).toBeInTheDocument();
});
