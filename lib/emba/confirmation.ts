import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { canAccessPersonal, type Principal } from './access';
import { audit, requireFirstParty } from './consent';
import { EmbaError } from './errors';

export type ConfirmationInput = { clientId: string; action: 'commitment' | 'identity_disclosure' | 'publication'; targetId: string; expectedVersion: number; payload: unknown };
const bindingSchema = z.strictObject({
  clientId: z.string().min(1).max(200), action: z.enum(['commitment','identity_disclosure','publication']),
  targetId: z.string().min(1).max(200), expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), payload: z.json(),
});

function snapshot(input: ConfirmationInput) {
  const data = bindingSchema.parse(input);
  const json = JSON.stringify(data.payload);
  if (Buffer.byteLength(json) > 32768) throw new EmbaError('forbidden');
  return { ...data, json };
}

async function currentIdentity(q: Q, principal: Principal) {
  if (!await canAccessPersonal(q, principal, principal.personId)) throw new EmbaError('forbidden');
  const { rows } = await q.query(
    'select 1 from emba_identity where issuer=$1 and subject=$2 and person_id=$3 and revoked_at is null for share',
    [principal.issuer, principal.subject, principal.personId]);
  if (!rows.length || principal.expiresAt <= Date.now()) throw new EmbaError('forbidden');
}

// PostgreSQL jsonb supplies canonical nested key ordering; arrays retain order.
// Inputs are structured action fields, never raw conversation or model output.
async function payloadHash(q: Q, json: string): Promise<string> {
  const { rows: [row] } = await q.query<{canonical:string}>('select $1::jsonb::text canonical', [json]);
  return createHash('sha256').update(row.canonical).digest('hex');
}

/** A future first-party review endpoint must display these exact fields first. */
export async function approveConfirmation(db: Db, principal: Principal, input: ConfirmationInput): Promise<{id:string; expires_at:string}> {
  const data = snapshot(input);
  return db.tx(async q => {
    await requireFirstParty(q, principal);
    await currentIdentity(q, principal);
    const hash = await payloadHash(q, data.json);
    const { rows: [row] } = await q.query<{id:string; expires_at:string}>(
      `insert into emba_confirmation(person_id,client_id,action,target_id,expected_version,payload_hash)
       values ($1,$2,$3,$4,$5,$6) returning id,expires_at`,
      [principal.personId, data.clientId, data.action, data.targetId, data.expectedVersion, hash]);
    await audit(q, principal, 'confirmation:approve', row.id);
    return row;
  });
}

/**
 * The trusted callback must reauthorize the current action lease, role and
 * consent, lock the target and compare its version, then apply only confirmed
 * fields using q. Throw on denial. External effects belong in a transactional
 * outbox, never in this callback: SQL rollback cannot undo an external request.
 */
export async function consumeConfirmation<T>(db: Db, principal: Principal, id: string, input: ConfirmationInput, execute: (q: Q, confirmed: ConfirmationInput) => Promise<T>): Promise<T> {
  z.uuid().parse(id);
  const data = snapshot(input);
  if (principal.clientId === null || principal.clientId !== data.clientId) throw new EmbaError('forbidden');
  return db.tx(async q => {
    // Callbacks may update this person; never upgrade a shared authorization lock.
    await q.query('select id from person where id=$1 for update',[principal.personId]);
    await currentIdentity(q, principal);
    const hash = await payloadHash(q, data.json);
    // Conditional UPDATE locks the row; a competing transaction rechecks the
    // consumed predicate after waiting. Effect and consumption commit together.
    const { rows } = await q.query(
      `update emba_confirmation set consumed_at=clock_timestamp()
       where id=$1 and person_id=$2 and client_id=$3 and action=$4 and target_id=$5
       and expected_version=$6 and payload_hash=$7 and consumed_at is null and expires_at>clock_timestamp()
       returning id`, [id, principal.personId, data.clientId, data.action, data.targetId, data.expectedVersion, hash]);
    if (!rows.length) throw new EmbaError('forbidden');
    if (principal.expiresAt <= Date.now()) throw new EmbaError('forbidden');
    const result = await execute(q, { clientId: data.clientId, action: data.action, targetId: data.targetId, expectedVersion: data.expectedVersion, payload: JSON.parse(data.json) });
    await audit(q, principal, 'confirmation:consume', id);
    return result;
  });
}
