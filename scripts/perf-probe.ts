// Measures what a signed-in page view costs in database round trips. Read-only: everything runs in one transaction that is rolled back.
//
//   node --conditions=react-server --import tsx scripts/perf-probe.ts [--seeded]
//
// With --seeded it first makes a team with something in every list (test/team-seed.ts), measures that team, and checks
// that what the reads answer through this driver is what the tests captured on PGlite. The team is rolled back with the rest.
//
// Queries run on one connection, so the times are the sequential cost; the count is exact.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { Db, Q } from '../lib/db';

async function main() {
  process.loadEnvFile('.env.local');
  const { PARSERS, poolConfig, databaseUrl, setDb } = await import('../lib/db');
  const { authenticate, canAccessLoop } = await import('../lib/emba/access');
  const { listGroupTree } = await import('../lib/emba/group-tree');
  const { listReceivedInvitations } = await import('../lib/emba/invitations');
  const { briefHistory, myRecentRecords, teamBrief, teamState } = await import('../lib/emba/team-read');
  const { listTeamEvents } = await import('../lib/emba/team-events');
  const { upcomingEvents } = await import('../lib/emba/team-interest');
  const { listAsks } = await import('../lib/emba/team-asks');

  const connectStart = performance.now();
  const client = new pg.Client({ ...poolConfig(databaseUrl(process.env)!), types: { getTypeParser: ((oid: number, format?: string) => PARSERS[oid] ?? pg.types.getTypeParser(oid, format as 'text')) as typeof pg.types.getTypeParser } });
  await client.connect();
  console.log(`connect ${Math.round(performance.now() - connectStart)}ms`);

  let count = 0, depth = 0;
  // Isolation cannot be set inside the probe's outer transaction; the app pays a round trip for it, so `select 1` stands in.
  const q: Q = { query: (text, params) => { count++; return (text.startsWith('set transaction isolation') ? client.query('select 1') : client.query(text, params as unknown[])) as never; } };
  const database: Db = { ...q, async tx(fn) {
    const name = `p${++depth}`;
    await q.query(`savepoint ${name}`);
    try { const out = await fn(q); await q.query(`release savepoint ${name}`); return out; }
    catch (error) { await q.query(`rollback to savepoint ${name}`).catch(() => {}); throw error; }
  } };
  setDb(database);
  await client.query('begin');

  const trips: number[] = [];
  for (let i = 0; i < 10; i++) { const t = performance.now(); await client.query('select 1'); trips.push(performance.now() - t); }
  trips.sort((a, b) => a - b);
  console.log(`round trip: median ${Math.round(trips[5])}ms, min ${Math.round(trips[0])}ms, max ${Math.round(trips[9])}ms`);

  const measure = async <T>(label: string, run: () => Promise<T>): Promise<T> => {
    const before = count, t = performance.now();
    const out = await run();
    console.log(`${label.padEnd(34)} ${String(count - before).padStart(4)} queries ${String(Math.round(performance.now() - t)).padStart(6)}ms`);
    return out;
  };

  const subject = (process.env.LOOP_PILOT_OWNER_SUBJECTS ?? '').split(',')[0]?.trim(), issuer = process.env.LOOP_AUTH_ISSUER!;
  const principal = await authenticate(q, 'probe', async () => ({ issuer, subject, expiresAt: Date.now() + 600_000, authenticatedAt: Date.now(), verifiedEmail: process.env.LOOP_PILOT_OWNER_EMAIL }));
  if (!principal) throw new Error('No identity for LOOP_PILOT_OWNER_SUBJECTS in this database.');

  const tree = await measure('listGroupTree (layout)', () => listGroupTree(database, principal));
  console.log(`  ${tree.length} groups`);
  await measure('listGroupTree (page, again)', () => listGroupTree(database, principal));
  await measure('listReceivedInvitations', () => listReceivedInvitations(database, principal));
  let found: { orgId: string; loopId: string } | undefined = tree[0] && { orgId: tree[0].orgId, loopId: tree[0].loopId };
  if (process.argv.includes('--seeded')) {
    const { captureTeam, seedBusyTeam } = await import('../test/team-seed');
    const seedStart = performance.now(), before = count;
    // The capture was made with an owner of this name; the change is rolled back with the team.
    await client.query("update person set name='Olivia Owner' where id=$1", [principal.personId]);
    const seeded = await seedBusyTeam(database, principal);
    console.log(`seeded a busy team: ${count - before} queries ${Math.round(performance.now() - seedStart)}ms`);
    const lines = (text: string) => text.split(/\r?\n/).filter(Boolean);
    const got = lines(JSON.stringify(await captureTeam(database, seeded), null, 1)), want = lines(readFileSync('lib/__tests__/captures/busy-team.json', 'utf8'));
    const at = got.length === want.length ? got.findIndex((line, index) => line !== want[index]) : Math.min(got.length, want.length);
    console.log(`answers through pg match the PGlite capture: ${at < 0 ? 'yes' : `NO, from line ${at + 1}: got ${got[at]} | captured ${want[at]}`}`);
    found = seeded.team;
  }
  const scope = found;
  if (scope) {
    await measure('team page: everything after tree', async () => {
      await measure('  teamState', () => teamState(database, principal, scope));
      await measure('  teamBrief', () => teamBrief(database, principal, scope));
      await measure('  listTeamEvents', () => listTeamEvents(database, principal, scope));
      await measure('  myRecentRecords', () => myRecentRecords(database, principal, scope));
      await measure('  briefHistory', () => briefHistory(database, principal, scope).catch(() => null));
      await measure('  upcomingEvents', () => upcomingEvents(database, principal, { ...scope, people: true }));
      await measure('  listTeamEvents archived', () => listTeamEvents(database, principal, { ...scope, archived: true }).catch(() => null));
      await measure('  listAsks', () => listAsks(database, principal, scope));
      await measure('  manage check', () => database.tx(q => canAccessLoop(q, principal, scope.orgId, scope.loopId, 'manage')));
      await measure('  post check', () => database.tx(q => canAccessLoop(q, principal, scope.orgId, scope.loopId, 'post')));
    });
  }
  await client.query('rollback');
  await client.end();
}
main().catch(error => { console.error(error); process.exit(1); });
