// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate } from '@/lib/emba/access';
import { listPortalGroups } from '@/lib/emba/groups';
import { listAsks, askResults } from '@/lib/emba/team-asks';
import { upcomingEvents } from '@/lib/emba/team-interest';
import { GROUPS, SAMPLE_ISSUER, seedClasses } from '@/scripts/emba-seed';

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from emba_deletion_tombstone'); });
afterEach(() => vi.unstubAllEnvs());

it('seeds the sample class groups once, with events, interest and asks the owner still has to answer', async () => {
  const row = await makePerson(t.db, 'Owner');
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  const owner = (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: 'owner@example.test' })))!;
  vi.stubEnv('LOOP_PILOT_OWNER_SUBJECTS', owner.subject);
  // A moment before anything in the syllabi, so every event and ask is still ahead.
  const now = Date.parse('2026-11-01T00:00:00Z');
  vi.useFakeTimers({ now, toFake: ['Date'] });
  try {
    const report = await seedClasses(t.db, owner, now);
    expect(report.map(item => [item.namespace, item.state, item.events, item.asks])).toEqual(GROUPS.map(group => [group.namespace, 'created', group.events.length, group.asks.length]));
    expect(report.every(item => /^\/groups\/request#token=/.test(item.joinLink ?? ''))).toBe(true);
    const groups = (await listPortalGroups(t.db, owner)).filter(group => group.slug === 'workspace');
    expect(groups.map(group => group.namespace).sort()).toEqual(['nbae-6561', 'nbae-6830']);
    const venture = groups.find(group => group.namespace === 'nbae-6830')!, scope = { orgId: venture.orgId, loopId: venture.loopId };
    const events = await upcomingEvents(t.db, owner, scope);
    expect(events.timezone).toBe('America/New_York');
    expect(events.events.items.find(event => event.slug === 'demo-day')).toMatchObject({ starts: expect.stringContaining('13:30'), interested: 5 });
    const asks = await listAsks(t.db, owner, scope);
    expect(asks.open.items).toHaveLength(3);
    expect(asks.open.items.every(ask => ask.yourAnswer === null)).toBe(true);
    const first = await askResults(t.db, owner, { ...scope, number: asks.open.items.find(ask => ask.youAsked)!.number });
    expect(first.ask).toMatchObject({ answered: 3, expected: 6 });
    expect(first.ask.missing).toHaveLength(3);
    // Sample classmates can sign in nowhere, and a second run changes nothing.
    const { rows } = await t.db.query<{ n: number }>('select count(*)::int as n from emba_identity where issuer=$1', [SAMPLE_ISSUER]);
    expect(rows[0].n).toBe(5);
    expect((await seedClasses(t.db, owner, now)).map(item => item.state)).toEqual(['exists', 'exists']);
    expect((await t.db.query<{ n: number }>('select count(*)::int as n from person')).rows[0].n).toBe(6);
  } finally { vi.useRealTimers(); }
});
