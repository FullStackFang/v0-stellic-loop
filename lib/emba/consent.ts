import 'server-only';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { canAccessLoop, canAccessPersonal, type Principal } from './access';
import { EmbaError } from './errors';

export const actionSchema = z.enum(['memory:read','memory:write','plan:read','activity:write','group-memory:write']);
export type Action = z.infer<typeof actionSchema>;
export const scopeShape = { orgId: z.uuid().nullable().default(null), loopId: z.uuid().nullable().default(null) };
export type Scope = { orgId: string | null; loopId: string | null };
export const leaseSchema = z.strictObject({
  clientId: z.string().trim().min(1).max(200), actions: z.array(actionSchema).min(1).max(5),
  expiresAt: z.iso.datetime({ offset: true }), ...scopeShape,
}).refine(v => (v.orgId === null) === (v.loopId === null))
  .refine(v => !v.actions.includes('group-memory:write') || v.loopId !== null);

export async function requireFirstParty(q: Q, principal: Principal) {
  if (principal.clientId !== null || !await canAccessPersonal(q,principal,principal.personId)) throw new EmbaError('forbidden');
}

export async function authorize(q: Q, principal: Principal, action: Action, scope: Scope): Promise<string | null> {
  if ((scope.orgId === null) !== (scope.loopId === null)) throw new EmbaError('forbidden');
  // The group check begins with the personal check, so the personal check runs on its own only when no group is named.
  if (scope.orgId && scope.loopId ? !await canAccessLoop(q,principal,scope.orgId,scope.loopId,'read') : !await canAccessPersonal(q,principal,principal.personId)) throw new EmbaError('forbidden');
  return leaseFor(q,principal,action,scope);
}

/**
 * SQL that is true when the lease aliased `lease` was given on the group `loop` of organization `org`, or on a group
 * above it: a grant covers the group and every group built inside it. `org` and `loop` are SQL expressions.
 */
export const leaseCovers = (lease: string, org: string, loop: string) => `(${lease}.org_id=${org} and ${lease}.loop_id in (
  with recursive covers_up as (select id,parent_id from emba_loop where org_id=${org} and id=${loop}
   union all select covers_l.id,covers_l.parent_id from emba_loop covers_l join covers_up on covers_l.id=covers_up.parent_id where covers_l.org_id=${org})
  select id from covers_up))`;

/**
 * The consent half of authorize, for a caller that has already checked access: the site needs no lease, an assistant
 * needs a live one that carries the action, given on this group or on a group above it. With no group named it needs
 * one given for no group. Any covering lease that allows the action allows it: there is no order between them.
 */
export async function leaseFor(q: Q, principal: Principal, action: Action, scope: Scope): Promise<string | null> {
  if (principal.clientId === null) return null;
  if (!principal.scopes.includes(action)) throw new EmbaError('forbidden');
  const { rows: [lease] } = await q.query<{id:string}>(
    `select e.id from emba_lease e where e.person_id=$1 and e.client_id=$2 and $3=any(e.actions)
     and case when $5::uuid is null then e.org_id is null and e.loop_id is null and $4::uuid is null else ${leaseCovers('e','$4::uuid','$5::uuid')} end
     and e.revoked_at is null and e.expires_at > clock_timestamp() order by e.expires_at desc limit 1 for share`,
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
export async function renewGroupReadLease(db: Db, principal: Principal, id: string): Promise<void> {
  z.uuid().parse(id);
  await db.tx(async q => {
    await requireFirstParty(q, principal);
    const { rows: [lease] } = await q.query<{ clientId: string; orgId: string | null; loopId: string | null; actions: string[]; revokedAt: string | null }>(
      'select client_id as "clientId",org_id as "orgId",loop_id as "loopId",actions,revoked_at as "revokedAt" from emba_lease where id=$1 and person_id=$2 for update', [id, principal.personId]);
    // A team grant is read, or read and write (design D15). Renewal keeps exactly the actions it had.
    const renewable = ['plan:read', 'group-memory:write plan:read'].includes([...(lease?.actions ?? [])].sort().join(' '));
    if (!lease || lease.revokedAt || !lease.orgId || !lease.loopId || !renewable) throw new EmbaError('forbidden');
    await authorize(q, principal, 'plan:read', { orgId: lease.orgId, loopId: lease.loopId });
    await q.query('update emba_lease set revoked_at=clock_timestamp() where id=$1', [id]);
    const { rows: [replacement] } = await q.query<{ id: string }>(
      "insert into emba_lease(person_id,client_id,actions,org_id,loop_id,expires_at) values($1,$2,$3,$4,$5,clock_timestamp()+interval '30 days') returning id",
      [principal.personId, lease.clientId, lease.actions, lease.orgId, lease.loopId]);
    await audit(q, principal, 'lease:revoke', id);
    await audit(q, principal, 'lease:grant', replacement.id);
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

export type RemovedGroupGrants = { group: string; removedAt: string | Date; clientIds: string[] };
/**
 * The person's own grants that ended because their group was removed, one entry per group, newest removal first.
 * A grant the person ended before the removal is left out, and so is one that would have run out by now anyway,
 * so each entry stops being reported on its own.
 */
export async function listRemovedGroupGrants(db: Db, principal: Principal): Promise<RemovedGroupGrants[]> {
  return db.tx(async q => {
    await requireFirstParty(q,principal);
    const { rows } = await q.query<RemovedGroupGrants>(
      `select coalesce(l.name,o.name) as "group",a.retired_at as "removedAt",array_agg(distinct e.client_id order by e.client_id) as "clientIds"
       from emba_lease e join emba_group_address a on a.org_id=e.org_id and a.loop_id=e.loop_id
       join emba_loop l on l.org_id=a.org_id and l.id=a.loop_id join emba_organization o on o.id=a.org_id
       where e.person_id=$1 and a.retired_at is not null and (e.revoked_at is null or e.revoked_at>=a.retired_at) and e.expires_at>clock_timestamp()
       group by a.org_id,a.loop_id,l.name,o.name,a.retired_at order by a.retired_at desc,a.loop_id limit 20`,[principal.personId]);
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
