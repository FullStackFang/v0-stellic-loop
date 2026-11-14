// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { openTestDb, type TestDb } from '@/test/db';
import { captureTeam, counting, seedBusyTeam, seedJoin, seedPerson, type BusyTeam, type Scope } from '@/test/team-seed';
import type { Db, Q } from '@/lib/db';
import type { Principal } from '@/lib/emba/access';
import { askResults, createAsk, listAsks } from '@/lib/emba/team-asks';
import { upcomingEvents } from '@/lib/emba/team-interest';
import { teamBrief, teamState } from '@/lib/emba/team-read';
import { logDecision } from '@/lib/emba/team-records';
import { createWorkspace } from '@/lib/emba/workspaces';

// Spec: openspec/changes/loop-faster-pages/specs/page-speed.
let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
const reset = async () => { await t.reset(); await t.db.query('delete from emba_deletion_tombstone'); };
afterEach(() => vi.unstubAllEnvs());

async function owner() {
  const p = await seedPerson(t.db, 99, 'Olivia Owner');
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', p.subject);
  return p;
}
const inDays = (days: number) => `${new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 19)}Z`;

// One seeded team serves the three tests below; none of them writes anything but read records.
describe('a busy team', () => {
let f: BusyTeam;
beforeAll(async () => { await reset(); f = await seedBusyTeam(t.db, await owner()); }, 240000);

it('tells the site and an assistant the same as before the list builders changed', async () => {
  await expect(`${JSON.stringify(await captureTeam(t.db, f), null, 1)}\n`).toMatchFileSnapshot('./captures/busy-team.json');
}, 240000);

// Statements as the test database counts them: `begin` and `commit` are two more per read on the wire.
// A read spends 7 of them before its own work (isolation, four for access, the team's head, the read record).
// Before the list builders were folded (2026-11-13) the same reads took 33, 31 and 27.
const BUDGET = { teamState: 18, teamBrief: 18, listAsks: 17 };
it('keeps a team page read inside its budget of statements', async () => {
  const c = counting(t.db);
  const spent = { teamState: await c.of(db => teamState(db, f.ben, f.team)), teamBrief: await c.of(db => teamBrief(db, f.ben, f.team)), listAsks: await c.of(db => listAsks(db, f.ben, f.team)) };
  for (const [read, budget] of Object.entries(BUDGET)) expect(spent[read as keyof typeof spent], read).toBeLessThanOrEqual(budget);
}, 240000);

it('selects a name for a person on the site and never for an assistant', async () => {
  const seen = async (who: Principal) => {
    const rows: unknown[] = [];
    const record = (q: Q): Q => ({ query: async <T,>(text: string, params?: unknown[]) => { const result = await q.query<T>(text, params); rows.push(...result.rows); return result; } });
    const db: Db = { ...record(t.db), tx: fn => t.db.tx(q => fn(record(q))) };
    await askResults(db, who, { ...f.team, number: f.asks.bring }); await upcomingEvents(db, who, { ...f.team, people: true }); await teamState(db, who, f.team);
    return JSON.stringify(rows);
  };
  // Every row the database returned while the read ran, not only what the read passed on.
  expect(await seen(f.ana)).toMatch(/Ben Member/);
  expect(await seen(f.assistant)).not.toMatch(/Member|Leaver|Follower|Olivia/);
}, 120000);
});

it('reads a list of twenty records, or twenty asks, in the same number of statements as a list of one', async () => {
  await reset();
  const lead = await owner(), members: Principal[] = [];
  const team = async (namespace: string): Promise<Scope> => {
    const group = await createWorkspace(t.db, lead, { name: namespace, description: '', namespace }), scope = { orgId: group.orgId, loopId: group.loopId };
    for (const p of members) await seedJoin(t.db, scope, p, 'member');
    return scope;
  };
  for (let n = 1; n <= 4; n++) members.push(await seedPerson(t.db, n, `Member ${n}`));
  const fill = async (scope: Scope, count: number) => {
    for (let i = 0; i < count; i++) {
      const who = members[i % members.length];
      expect((await logDecision(t.db, who, { ...scope, topic: `topic-${i}`, statement: `Decision ${i}.`, newTopic: true, tags: [] })).saved).toBe(true);
      expect((await createAsk(t.db, who, { ...scope, question: `Question ${i}?`, kind: 'one', options: ['Yes', 'No'], closesAt: inDays(2) })).saved).toBe(true);
    }
    return scope;
  };
  const one = await fill(await team('one-each'), 1), twenty = await fill(await team('twenty-each'), 20);
  const c = counting(t.db), reader = members[0];
  expect((await teamState(t.db, reader, twenty)).decisions.items).toHaveLength(20);
  expect((await listAsks(t.db, reader, twenty)).open.items).toHaveLength(20);
  expect(await c.of(db => teamState(db, reader, twenty))).toBe(await c.of(db => teamState(db, reader, one)));
  expect(await c.of(db => listAsks(db, reader, twenty))).toBe(await c.of(db => listAsks(db, reader, one)));
  expect(await c.of(db => teamBrief(db, reader, twenty))).toBe(await c.of(db => teamBrief(db, reader, one)));
}, 240000);
