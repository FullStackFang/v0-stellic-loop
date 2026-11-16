import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { openTestDb, type TestDb } from '@/test/db';
import { seedEmbaFixture } from '@/test/emba-fixture';
import { authenticate, type Principal } from '@/lib/emba/access';
import { grantLease } from '@/lib/emba/consent';
import { registerGroupAddress } from '@/lib/emba/groups';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { metricsCsv, noteConnectView, pilotMetrics } from '@/lib/emba/pilot-metrics';
import { answerAsk, createAsk } from '@/lib/emba/team-asks';
import { saveBrief } from '@/lib/emba/team-read';
import MetricsPage from './metrics/page';
import { GET as exportCsv } from './metrics/export/route';

// Specs: openspec/changes/loop-club-reach/specs/pilot-metrics.
let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from emba_deletion_tombstone'); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const forever = '2099-01-01T00:00:00Z';
async function fixture() {
  const f = await seedEmbaFixture(t.db); await t.db.query("update emba_role set role='owner' where person_id=$1", [f.organizer.personId]);
  const root = { orgId: f.orgId, loopId: f.rootId };
  await registerGroupAddress(t.db, f.organizer, { ...root, namespace: 'club', slug: 'workspace' });
  await saveBrief(t.db, f.organizer, { ...root, body: 'Wine club.', timezone: 'UTC', expectedVersion: 0 });
  // The operator is a person outside the group; the group's organizer is not the operator.
  vi.stubEnv('LOOP_OPERATOR_SUBJECTS', f.nonmember.subject);
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', f.organizer.subject);
  const session = async (who: Principal, hostName: string | null, calls: [tool: string, via: 'model' | 'card'][]) => {
    const { rows: [{ id }] } = await t.db.query<{ id: string }>("insert into emba_connector_session(person_id,client_id,host_name,host_version) values($1,'claude',$2,'1.0') returning id", [who.personId, hostName]);
    for (const [index, [tool, via]] of calls.entries()) await t.db.query("insert into emba_connector_call(person_id,client_id,session_id,tool,via,first_in_session) values($1,'claude',$2,$3,$4,$5)", [who.personId, id, tool, via, index === 0]);
  };
  await session(f.memberA, 'claude-ai', [['waiting', 'model'], ['answer', 'card']]);
  await session(f.memberA, 'claude-ai', [['brief', 'model'], ['answer', 'model'], ['interested', 'card']]);
  await session(f.memberB, 'claude-ai', []);
  await session(f.memberB, 'chatgpt', [['waiting', 'model']]);
  await session(f.members[2], 'claude-ai', []);
  await grantLease(t.db, f.memberA, { ...root, clientId: 'claude', actions: ['plan:read'], expiresAt: forever });
  await noteConnectView(t.db, f.memberA); await noteConnectView(t.db, f.memberA); await noteConnectView(t.db, f.memberB);
  const asked = await createAsk(t.db, f.organizer, { ...root, question: 'Red or white?', kind: 'text', closesAt: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 19) + 'Z' });
  if (!asked.saved) throw new Error('fixture ask not saved');
  await answerAsk(t.db, f.memberA, { ...root, number: 1, text: 'Secret answer text' });
  await answerAsk(t.db, f.memberB, { ...root, number: 1, text: 'Another answer' }, 'personal_link');
  await answerAsk(t.db, f.members[2], { ...root, number: 1, text: 'Late answer' });
  await t.db.query("update emba_ask_answer set at=at+interval '3 days' where person_id=$1", [f.members[2].personId]);
  return { ...f, root };
}

it('gives the operator aggregate numbers per assistant, the connecting funnel, and answers by route', async () => {
  const f = await fixture();
  const m = await pilotMetrics(t.db, f.nonmember);
  // One member used ChatGPT: a row about one member is not shown, alone or as "other".
  expect(m.hosts).toEqual([{ host: 'claude-ai', members: 3, sessions: 4, waitingFirst: 1, otherFirst: 1, noCall: 2, byCard: 2, byModel: 1 }]);
  expect(m.funnel).toEqual({ joined: 9, openedConnectPage: 2, hosts: [{ host: 'claude-ai', signedIn: 3, granted: 1, called: 1 }] });
  expect(m.groups).toMatchObject([{ group: '@club', asks: 1, expected: 9, within48: { site: 1, share_link: 0, personal_link: 1, assistant: 0, assistant_card: 0, whatsapp: 0 }, medianHoursToClose: null }]);
  // One row per group and week; no person, handle, id or answer text anywhere in the numbers or the file.
  const csv = metricsCsv(m), lines = csv.trim().split('\r\n');
  expect(lines[0]).toBe('group,week,asks,expected_answers,within_48h_site,within_48h_share_link,within_48h_personal_link,within_48h_assistant,within_48h_assistant_card,within_48h_whatsapp,median_hours_to_close');
  expect(lines).toHaveLength(2);
  expect(lines[1]).toMatch(/^club,\d{4}-\d{2}-\d{2},1,9,1,0,1,0,0,0,$/);
  for (const text of [csv, JSON.stringify(m)]) expect(text).not.toMatch(/Member|Organizer|person-|Secret answer|00000000-0000/);
});

it('refuses everyone but the operator: an organizer, a member, an assistant, and nobody', async () => {
  const f = await fixture();
  const agent = (await authenticate(t.db, 'test', async () => ({ issuer: f.nonmember.issuer, subject: f.nonmember.subject, clientId: 'claude', scopes: ['plan:read'], expiresAt: Date.parse(forever) })))!;
  for (const who of [f.organizer, f.memberA, agent, null]) await expect(pilotMetrics(t.db, who)).rejects.toThrow('forbidden');
  const page = (who: Principal) => withPortalTestSession(who, () => MetricsPage());
  await expect(page(f.organizer)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  expect((await withPortalTestSession(f.organizer, () => exportCsv())).status).toBe(404);
  // The operator gets the page and the file.
  render(await page(f.nonmember));
  expect(screen.getByRole('heading', { name: 'Do assistants check Loop first?' })).toBeInTheDocument();
  expect(screen.getByText(/Conversations in which the assistant never contacted Loop cannot be seen here/)).toBeInTheDocument();
  expect(screen.getByText('9 joined a group · 2 opened the connect page')).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/Member [A-Z0-9]|Secret answer/);
  const file = await withPortalTestSession(f.nonmember, () => exportCsv());
  expect(file.status).toBe(200);
  expect(file.headers.get('content-type')).toBe('text/csv; charset=utf-8');
  expect((await file.text()).startsWith('group,week,asks')).toBe(true);
});
