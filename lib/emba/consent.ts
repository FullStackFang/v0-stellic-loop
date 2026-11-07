import 'server-only';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { canAccessLoop, canAccessPersonal, type Principal } from './access';
import { EmbaError } from './errors';

export const actionSchema = z.enum(['memory:read','memory:write','plan:read','activity:write']);
export type Action = z.infer<typeof actionSchema>;
export const scopeShape = { orgId: z.uuid().nullable().default(null), loopId: z.uuid().nullable().default(null) };
export type Scope = { orgId: string | null; loopId: string | null };
export const leaseSchema = z.strictObject({
  clientId: z.string().trim().min(1).max(200), actions: z.array(actionSchema).min(1).max(4),
  expiresAt: z.iso.datetime({ offset: true }), ...scopeShape,
}).refine(v => (v.orgId === null) === (v.loopId === null));

export async function requireFirstParty(q: Q, principal: Principal) {
  if (principal.clientId !== null || !await canAccessPersonal(q,principal,principal.personId)) throw new EmbaError('forbidden');
}

export async function authorize(q: Q, principal: Principal, action: Action, scope: Scope): Promise<string | null> {
  if (!await canAccessPersonal(q,principal,principal.personId)) throw new EmbaError('forbidden');
  if ((scope.orgId === null) !== (scope.loopId === null)) throw new EmbaError('forbidden');
  if (scope.orgId && scope.loopId && !await canAccessLoop(q,principal,scope.orgId,scope.loopId,'read')) throw new EmbaError('forbidden');
  if (principal.clientId === null) return null;
  if (!principal.scopes.includes(action)) throw new EmbaError('forbidden');
  const { rows: [lease] } = await q.query<{id:string}>(
    `select id from emba_lease where person_id=$1 and client_id=$2 and $3=any(actions)
     and org_id is not distinct from $4::uuid and loop_id is not distinct from $5::uuid
     and revoked_at is null and expires_at > clock_timestamp() order by expires_at desc limit 1 for share`,
    [principal.personId,principal.clientId,action,scope.orgId,scope.loopId]);
  if (!lease) throw new EmbaError('forbidden');
  return lease.id;
}

export async function audit(q: Q, principal: Principal, action: string, resourceId: string | null = null, leaseId: string | null = null) {
  await q.query('insert into emba_audit (person_id,client_id,action,resource_id,lease_id) values ($1,$2,$3,$4,$5)',
    [principal.personId,principal.clientId,action,resourceId,leaseId]);
}

export async function grantLease(db: Db, principal: Principal, input: unknown): Promise<{id:string}> {
  const data = leaseSchema.parse(input);
  if (Date.parse(data.expiresAt) <= Date.now()) throw new EmbaError('forbidden');
  return db.tx(async q => {
    await requireFirstParty(q,principal);
    await authorize(q,principal,'memory:read',data);
    const { rows: [lease] } = await q.query<{id:string}>(
      'insert into emba_lease (person_id,client_id,actions,org_id,loop_id,expires_at) values ($1,$2,$3,$4,$5,$6) returning id',
      [principal.personId,data.clientId,[...new Set(data.actions)],data.orgId,data.loopId,data.expiresAt]);
    await audit(q,principal,'lease:grant',lease.id);
    return lease;
  });
}
export async function revokeLease(db: Db, principal: Principal, id: string): Promise<void> {
  z.uuid().parse(id);
  await db.tx(async q => {
    await requireFirstParty(q,principal);
    const { rows } = await q.query('update emba_lease set revoked_at=coalesce(revoked_at,now()) where id=$1 and person_id=$2 returning id',[id,principal.personId]);
    if (!rows.length) throw new EmbaError('not_found');
    await audit(q,principal,'lease:revoke',id);
  });
}

export async function listLeases(db: Db, principal: Principal) {
  return db.tx(async q => {
    await requireFirstParty(q,principal);
    const { rows } = await q.query('select id,client_id,actions,org_id,loop_id,expires_at,revoked_at from emba_lease where person_id=$1 order by created_at desc limit 100',[principal.personId]);
    await audit(q,principal,'lease:list');
    return rows;
  });
}

export async function readAudit(db: Db, principal: Principal) {
  return db.tx(async q => {
    await requireFirstParty(q,principal);
    const { rows } = await q.query('select id,client_id,action,resource_id,at,outcome from emba_audit where person_id=$1 order by at desc,id limit 100',[principal.personId]);
    await audit(q,principal,'audit:read');
    return rows;
  });
}
