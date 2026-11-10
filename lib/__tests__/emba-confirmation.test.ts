import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { openTestDb, makePerson, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '../emba/access';
import { approveConfirmation, consumeConfirmation, type ConfirmationInput } from '../emba/confirmation';

let t: TestDb;
let actor: Principal, agent: Principal, other: Principal;
const input: ConfirmationInput = { clientId: 'assistant-a', action: 'commitment', targetId: 'activity-a', expectedVersion: 3, payload: { conditions: { min: 4, days: ['2099-01-01'] }, disclose: false } };
beforeAll(async () => { t = await openTestDb(); });
beforeEach(async () => {
  await t.reset();
  const p = await makePerson(t.db), p2 = await makePerson(t.db);
  for (const person of [p, p2]) await t.db.query('insert into emba_identity(issuer,subject,person_id,verified_at) values ($1,$2,$3,now())', ['issuer', person.id, person.id]);
  const auth = (subject: string, clientId?: string) => authenticate(t.db, 'trusted', async () => ({ issuer: 'issuer', subject, clientId, expiresAt: Date.now() + 3600000 }));
  actor = (await auth(p.id))!; agent = (await auth(p.id, input.clientId))!; other = (await auth(p2.id, input.clientId))!;
});
afterAll(async () => { await t.close(); });

it('accepts only first-party approval, stores a digest, and expires in exactly ten minutes', async () => {
  await expect(approveConfirmation(t.db, agent, input)).rejects.toThrow();
  const c = await approveConfirmation(t.db, actor, input);
  const { rows: [row] } = await t.db.query<{payload_hash:string; ttl:number}>('select payload_hash,extract(epoch from expires_at-created_at)::int ttl from emba_confirmation where id=$1', [c.id]);
  expect(row.ttl).toBe(600); expect(row.payload_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(row)).not.toContain('conditions');
});

it('canonicalizes nested object keys, executes once, and blocks a replay', async () => {
  const c = await approveConfirmation(t.db, actor, input);
  const execute = vi.fn(async () => 'done');
  const reordered = { ...input, payload: { disclose: false, conditions: { days: ['2099-01-01'], min: 4 } } };
  expect(await consumeConfirmation(t.db, agent, c.id, reordered, execute)).toBe('done');
  await expect(consumeConfirmation(t.db, agent, c.id, input, execute)).rejects.toThrow();
  expect(execute).toHaveBeenCalledTimes(1);
});

it('rejects changed actor, client, action, target, payload or expected version without consuming approval', async () => {
  const c = await approveConfirmation(t.db, actor, input), execute = vi.fn(async () => true);
  await expect(consumeConfirmation(t.db, other, c.id, input, execute)).rejects.toThrow();
  await expect(consumeConfirmation(t.db, actor, c.id, input, execute)).rejects.toThrow();
  for (const change of [{ clientId: 'assistant-b' }, { action: 'publication' as const }, { targetId: 'activity-b' }, { expectedVersion: 4 }, { payload: { disclose: true } }]) {
    await expect(consumeConfirmation(t.db, agent, c.id, { ...input, ...change }, execute)).rejects.toThrow();
  }
  expect(execute).not.toHaveBeenCalled();
  expect(await consumeConfirmation(t.db, agent, c.id, input, execute)).toBe(true);
});

it('denies expired approvals and identities revoked since approval', async () => {
  const c = await approveConfirmation(t.db, actor, input), execute = vi.fn(async () => true);
  await t.db.query("update emba_confirmation set created_at=now()-interval '11 minutes',expires_at=now()-interval '1 minute' where id=$1", [c.id]);
  await expect(consumeConfirmation(t.db, agent, c.id, input, execute)).rejects.toThrow();
  const fresh = await approveConfirmation(t.db, actor, input);
  await t.db.query('update emba_identity set revoked_at=now() where person_id=$1', [actor.personId]);
  await expect(consumeConfirmation(t.db, agent, fresh.id, input, execute)).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
});

it('rolls back both consumption and effect when execution authorization or effect fails', async () => {
  const c = await approveConfirmation(t.db, actor, input);
  await expect(consumeConfirmation(t.db, agent, c.id, input, async q => {
    await q.query("update person set name='effect should roll back' where id=$1", [actor.personId]);
    throw new Error('lease revoked or target stale');
  })).rejects.toThrow('lease revoked or target stale');
  const { rows: [person] } = await t.db.query<{name:string}>('select name from person where id=$1', [actor.personId]);
  expect(person.name).not.toBe('effect should roll back');
  expect(await consumeConfirmation(t.db, agent, c.id, input, async () => 'retry')).toBe('retry');
});

it('allows one winner among concurrent attempts (in-process transaction regression)', async () => {
  const c = await approveConfirmation(t.db, actor, input), execute = vi.fn(async () => true);
  const results = await Promise.allSettled([
    consumeConfirmation(t.db, agent, c.id, input, execute),
    consumeConfirmation(t.db, agent, c.id, input, execute),
  ]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(execute).toHaveBeenCalledTimes(1);
});

it('rolls back the effect and consumption if success audit cannot persist', async () => {
  const c = await approveConfirmation(t.db, actor, input);
  const unavailable = { ...t.db, tx: <T>(fn: Parameters<typeof t.db.tx<T>>[0]) => t.db.tx(q => fn({
    query: (sql, params) => {
      if (sql.startsWith('insert into emba_audit')) throw new Error('audit unavailable');
      return q.query(sql, params);
    },
  })) };
  await expect(consumeConfirmation(unavailable, agent, c.id, input, async q => {
    await q.query("update person set name='must roll back' where id=$1", [actor.personId]);
  })).rejects.toThrow('audit unavailable');
  expect((await t.db.query<{name:string}>('select name from person where id=$1', [actor.personId])).rows[0].name).not.toBe('must roll back');
  expect(await consumeConfirmation(t.db, agent, c.id, input, async () => true)).toBe(true);
});
