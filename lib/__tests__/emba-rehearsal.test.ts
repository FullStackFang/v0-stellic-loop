import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openTestDb, type TestDb } from '@/test/db';
import { seedEmbaFixture, finalizeEmbaFixture, afternoon } from '@/test/emba-fixture';
import { authenticate } from '@/lib/emba/access';
import { createMemoryMcpServer } from '@/lib/emba/mcp';
import { grantLease, revokeLease } from '@/lib/emba/consent';
import { approveConfirmation, type ConfirmationInput } from '@/lib/emba/confirmation';
import { readAnnouncement, verifyAnnouncement } from '@/lib/emba/announcements';
import { readOrganizerReport } from '@/lib/emba/disclosure';
import { searchKnowledge } from '@/lib/emba/knowledge';
import { planForMe } from '@/lib/emba/planning';
import { closeActivity } from '@/lib/emba/activities';

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t.close(); });

it('rehearses Vietnam and Estonia services through actual MCP tools', async () => {
  const f = await seedEmbaFixture(t.db);
  const update = await readAnnouncement(t.db, f.memberA, f.announcement.id);
  expect(update).toMatchObject({ verified: true, attestation: 'service-attested' });
  expect(verifyAnnouncement(update.envelope, update.text, update.signature, f.publicKey)).toBe(true);
  const passage = await searchKnowledge(t.db, f.memberA, { ...f.vietnam, query: 'Hanoi bus' });
  expect(passage).toEqual([expect.objectContaining({ documentId: f.document.id, version: 1, location: '/passages/0', timezone: 'Asia/Ho_Chi_Minh', sourceUrl: expect.stringContaining(f.document.id) })]);
  await expect(searchKnowledge(t.db, f.nonmember, { ...f.vietnam, query: 'Hanoi bus' })).rejects.toThrow('forbidden');
  expect(await searchKnowledge(t.db, f.memberB, { ...f.estonia, query: 'Hanoi bus' })).toEqual([]);
  expect((await planForMe(t.db, f.memberA, { ...f.vietnam, ...afternoon })).wants).toHaveLength(2);
  expect((await planForMe(t.db, f.memberB, { ...f.vietnam, ...afternoon })).wants).toEqual([]);

  const claims = { issuer: f.memberA.issuer, subject: f.memberA.subject, expiresAt: Date.parse('2099-01-01T00:00:00Z'), clientId: 'synthetic-assistant', scopes: ['memory:read', 'plan:read', 'activity:write'] };
  const delegate = (await authenticate(t.db, 'synthetic', async () => claims))!;
  const scoped = await grantLease(t.db, f.memberA, { ...f.vietnam, clientId: claims.clientId, actions: ['memory:read', 'plan:read', 'activity:write'], expiresAt: '2099-01-01T00:00:00Z' });
  await grantLease(t.db, f.memberA, { clientId: claims.clientId, actions: ['memory:read'], expiresAt: '2099-01-01T00:00:00Z' });
  const server = createMemoryMcpServer(t.db, delegate), client = new Client({ name: 'emba-rehearsal', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  try {
    expect((await client.listTools()).tools.map(x => x.name)).toEqual(expect.arrayContaining(['list_memory', 'plan_for_me', 'search_knowledge', 'prepare_commitment', 'execute_commitment']));
    expect((await client.listResources()).resources.map(x => x.uri)).toContain('loop://memory');
    expect(JSON.stringify(await client.readResource({ uri: 'loop://memory' }))).toContain('quiet Hanoi afternoon');
    const plan = await client.callTool({ name: 'plan_for_me', arguments: { ...f.vietnam, ...afternoon } });
    expect(plan.isError).not.toBe(true);
    expect(JSON.stringify(plan.structuredContent)).toContain(f.document.id);
    expect((await client.callTool({ name: 'plan_for_me', arguments: { ...f.estonia, ...afternoon } })).isError).toBe(true);
    const payload = { activityId: f.activity.id, revision: 1, operationId: '00000000-0000-4000-8000-000000000400', minOthers: 0, requires: [] };
    const prepared = await client.callTool({ name: 'prepare_commitment', arguments: payload });
    expect(prepared.isError).not.toBe(true);
    const approved = await approveConfirmation(t.db, f.memberA, (prepared.structuredContent as { review: ConfirmationInput }).review);
    expect((await client.callTool({ name: 'execute_commitment', arguments: { confirmationId: approved.id, payload: { ...payload, minOthers: 1 } } })).isError).toBe(true);
    expect((await client.callTool({ name: 'execute_commitment', arguments: { confirmationId: approved.id, payload } })).isError).not.toBe(true);
    expect((await client.callTool({ name: 'execute_commitment', arguments: { confirmationId: approved.id, payload } })).isError).toBe(true);
    await finalizeEmbaFixture(t.db, f);
    const outcomes = (await t.db.query<{ person_id: string; satisfied: boolean }>('select person_id,satisfied from emba_resolution_outcome where activity_id=$1', [f.activity.id])).rows;
    expect(outcomes).toHaveLength(8);
    expect(outcomes.filter(x => x.satisfied)).toHaveLength(6);
    await closeActivity(t.db, f.organizer, f.activity.id, 1, 'completed');
    expect(await readOrganizerReport(t.db, f.organizer, f.activity.id)).toEqual({ suppressed: true });
    await revokeLease(t.db, f.memberA, scoped.id);
    expect((await client.callTool({ name: 'plan_for_me', arguments: { ...f.vietnam, ...afternoon } })).isError).toBe(true);
  } finally { await client.close(); await server.close(); }
  const other = createMemoryMcpServer(t.db, f.nonmember), otherClient = new Client({ name: 'emba-nonmember', version: '1' });
  const [c, d] = InMemoryTransport.createLinkedPair();
  await other.connect(d); await otherClient.connect(c);
  try {
    expect((await otherClient.callTool({ name: 'search_knowledge', arguments: { ...f.vietnam, query: 'Hanoi bus' } })).isError).toBe(true);
    expect((await otherClient.callTool({ name: 'plan_for_me', arguments: { ...f.vietnam, ...afternoon } })).isError).toBe(true);
  } finally { await otherClient.close(); await other.close(); }
});
