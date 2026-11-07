// Synthetic local rehearsal only. No configured application DB or production credentials.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openTestDb } from '../test/db';
import { seedEmbaFixture, finalizeEmbaFixture, afternoon } from '../test/emba-fixture';
import { authenticate } from '../lib/emba/access';
import { grantLease, revokeLease } from '../lib/emba/consent';
import { approveConfirmation, type ConfirmationInput } from '../lib/emba/confirmation';
import { readAnnouncement } from '../lib/emba/announcements';
import { readOrganizerReport } from '../lib/emba/disclosure';
import { searchKnowledge } from '../lib/emba/knowledge';
import { closeActivity } from '../lib/emba/activities';
import { createMemoryMcpServer } from '../lib/emba/mcp';

async function main() {
  if (process.env.QB_DB === 'remote') throw new Error('Rehearsal requires disposable local database');
  const t = await openTestDb();
  try {
    const f = await seedEmbaFixture(t.db);
    assert.equal((await readAnnouncement(t.db, f.memberA, f.announcement.id)).verified, true);
    const cited = await searchKnowledge(t.db, f.memberA, { ...f.vietnam, query: 'Hanoi bus' });
    assert.equal(cited[0]?.documentId, f.document.id);
    assert.equal(cited[0]?.location, '/passages/0');
    await assert.rejects(searchKnowledge(t.db, f.nonmember, { ...f.vietnam, query: 'Hanoi bus' }));
    assert.deepEqual(await searchKnowledge(t.db, f.memberB, { ...f.estonia, query: 'Hanoi bus' }), []);
    const claims = { issuer: f.memberA.issuer, subject: f.memberA.subject, expiresAt: Date.parse('2099-01-01T00:00:00Z'), clientId: 'synthetic-assistant', scopes: ['memory:read', 'plan:read', 'activity:write'] };
    const delegate = (await authenticate(t.db, 'synthetic', async () => claims))!;
    const lease = await grantLease(t.db, f.memberA, { ...f.vietnam, clientId: claims.clientId, actions: claims.scopes, expiresAt: '2099-01-01T00:00:00Z' });
    await grantLease(t.db, f.memberA, { clientId: claims.clientId, actions: ['memory:read'], expiresAt: '2099-01-01T00:00:00Z' });
    const server = createMemoryMcpServer(t.db, delegate), client = new Client({ name: 'emba-local-rehearsal', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a);
    try {
      const tools = (await client.listTools()).tools.map(tool => tool.name);
      assert(tools.includes('plan_for_me') && tools.includes('execute_commitment'));
      assert((await client.listResources()).resources.some(resource => resource.uri === 'loop://memory'));
      assert(JSON.stringify(await client.readResource({ uri: 'loop://memory' })).includes('quiet Hanoi afternoon'));
      const plan = await client.callTool({ name: 'plan_for_me', arguments: { ...f.vietnam, ...afternoon } });
      assert(!plan.isError && JSON.stringify(plan.structuredContent).includes(f.document.id));
      assert((await client.callTool({ name: 'plan_for_me', arguments: { ...f.estonia, ...afternoon } })).isError);
      const payload = { activityId: f.activity.id, revision: 1, operationId: '00000000-0000-4000-8000-000000000400', minOthers: 0, requires: [] };
      const prepared = await client.callTool({ name: 'prepare_commitment', arguments: payload });
      assert(!prepared.isError);
      const approved = await approveConfirmation(t.db, f.memberA, (prepared.structuredContent as { review: ConfirmationInput }).review);
      assert((await client.callTool({ name: 'execute_commitment', arguments: { confirmationId: approved.id, payload: { ...payload, minOthers: 1 } } })).isError);
      assert(!(await client.callTool({ name: 'execute_commitment', arguments: { confirmationId: approved.id, payload } })).isError);
      assert((await client.callTool({ name: 'execute_commitment', arguments: { confirmationId: approved.id, payload } })).isError);
      await finalizeEmbaFixture(t.db, f);
      const outcomes = (await t.db.query<{ satisfied: boolean }>('select satisfied from emba_resolution_outcome where activity_id=$1', [f.activity.id])).rows;
      assert.equal(outcomes.length, 8); assert.equal(outcomes.filter(row => row.satisfied).length, 6);
      await closeActivity(t.db, f.organizer, f.activity.id, 1, 'completed');
      assert.deepEqual(await readOrganizerReport(t.db, f.organizer, f.activity.id), { suppressed: true });
      await revokeLease(t.db, f.memberA, lease.id);
      assert((await client.callTool({ name: 'plan_for_me', arguments: { ...f.vietnam, ...afternoon } })).isError);
      console.log('PASS: local synthetic EMBA fixture, signed update, cited bus, 8/6 resolution, suppressed report, MCP planning, confirmation and revocation.');
    } finally { await client.close(); await server.close(); }
  } finally { await t.close(); }
}

main().catch(() => { console.error('Local EMBA rehearsal failed; no credentials or private payloads logged.'); process.exitCode = 1; });
