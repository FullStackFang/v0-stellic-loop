import 'server-only';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { canAccessPersonal, type Principal } from './access';
import { revokeActivityEligibility } from './activities';
import { audit } from './consent';
import { EmbaError } from './errors';
import { releaseAfterAccessChange } from './team-records';

const roleSchema = z.enum(['owner', 'organizer', 'member', 'follower']);
const scopeSchema = z.strictObject({ orgId: z.uuid(), loopId: z.uuid(), personId: z.uuid() });
const grantSchema = scopeSchema.extend({ role: roleSchema });
type Scope = z.infer<typeof scopeSchema>;
type Role = z.infer<typeof roleSchema>;

function denied(): never { throw new EmbaError('forbidden'); }

async function firstParty(q: Q, principal: Principal | null): Promise<Principal> {
  if (!principal || principal.clientId !== null || !await canAccessPersonal(q, principal, principal.personId)) denied();
  return principal;
}

async function lockPeople(q: Q, personIds: string[]) {
  for (const id of [...new Set(personIds)].sort()) {
    const { rows } = await q.query('select id from person where id=$1 for update', [id]);
    if (!rows.length) denied();
  }
}

// The organization lock serializes role changes and last-owner checks.
async function lockOrganization(q: Q, orgId: string) {
  const { rows } = await q.query('select id from emba_organization where id=$1 for update', [orgId]);
  if (!rows.length) denied();
}

async function authority(q: Q, actor: Principal, orgId: string, loopId: string, required: 'owner' | 'manager') {
  const { rows: loops } = await q.query(
    `with recursive ancestors as (
      select id,parent_id from emba_loop where org_id=$1 and id=$2
      union all select l.id,l.parent_id from emba_loop l join ancestors a on l.id=a.parent_id where l.org_id=$1
    ) select l.id from emba_loop l join ancestors a on a.id=l.id order by l.path for share of l`,
    [orgId, loopId],
  );
  if (!loops.length) denied();
  const { rows } = await q.query(
    `with recursive ancestors as (
      select id,parent_id from emba_loop where org_id=$1 and id=$2
      union all select l.id,l.parent_id from emba_loop l join ancestors a on l.id=a.parent_id where l.org_id=$1
    ) select r.role from ancestors a
      join emba_role r on r.org_id=$1 and r.loop_id=a.id and r.person_id=$3 and r.revoked_at is null
      join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id and m.revoked_at is null
      join emba_identity i on i.person_id=r.person_id and i.issuer=$4 and i.subject=$5 and i.revoked_at is null
      where r.role=any($6::text[]) and not exists(select 1 from emba_deletion_tombstone t where t.person_id=r.person_id)
      for share of r,m,i`,
    [orgId, loopId, actor.personId, actor.issuer, actor.subject, required === 'owner' ? ['owner'] : ['owner', 'organizer']],
  );
  if (!rows.length) denied();
}

async function activeMembership(q: Q, scope: Scope, requireIdentity: boolean) {
  const { rows } = await q.query(
    `select 1 from emba_membership m where m.org_id=$1 and m.person_id=$2 and m.revoked_at is null
     and not exists(select 1 from emba_deletion_tombstone t where t.person_id=m.person_id)
     and ($3::boolean=false or exists(select 1 from emba_identity i where i.person_id=m.person_id and i.revoked_at is null))
     for share of m`, [scope.orgId, scope.personId, requireIdentity],
  );
  if (!rows.length) denied();
}

async function protectLastRootOwner(q: Q, scope: Scope, priorRole: Role | null) {
  if (priorRole !== 'owner') return;
  const { rows: roots } = await q.query<{ id: string }>('select id from emba_loop where org_id=$1 and id=$2 and parent_id is null', [scope.orgId, scope.loopId]);
  if (!roots.length) return;
  const { rows: owners } = await q.query(
    `select r.person_id from emba_role r join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id
     where r.org_id=$1 and r.loop_id=$2 and r.role='owner' and r.revoked_at is null and m.revoked_at is null
     and exists(select 1 from emba_identity i where i.person_id=r.person_id and i.revoked_at is null)
     and not exists(select 1 from emba_deletion_tombstone t where t.person_id=r.person_id)`,
    [scope.orgId, scope.loopId],
  );
  if (owners.length <= 1) denied();
}

async function invalidate(q: Q, scope: Scope) {
  await q.query('update emba_lease set revoked_at=clock_timestamp() where org_id=$1 and person_id=$2 and revoked_at is null', [scope.orgId, scope.personId]);
  await revokeActivityEligibility(q, scope.personId);
}

export type AccessibleLoop = { orgId: string; loopId: string; orgName: string; path: string };
export async function listMyLoops(db: Db, principal: Principal | null): Promise<AccessibleLoop[]> {
  return db.tx(async q => {
    const actor = await firstParty(q, principal);
    const { rows } = await q.query<AccessibleLoop>(
      `with recursive accessible as (
        select l.id,l.org_id from emba_loop l join emba_role r on r.org_id=l.org_id and r.loop_id=l.id
        join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id
        where r.person_id=$1 and r.revoked_at is null and m.revoked_at is null
        union select child.id,child.org_id from emba_loop child join accessible a on child.org_id=a.org_id and child.parent_id=a.id
      ) select o.id as "orgId",l.id as "loopId",coalesce(l.name,o.name) as "orgName",l.path
        from accessible a join emba_loop l on l.id=a.id and l.org_id=a.org_id
        join emba_organization o on o.id=l.org_id order by o.name,l.path`,
      [actor.personId],
    );
    await audit(q, actor, 'activity:write');
    return rows;
  });
}

export type ScopedRole = { personId: string; name: string; directRole: Role | null; effectiveRoles: Role[] };
export type OrganizationMember = { personId: string; name: string };
export async function listOrganizationMembers(db: Db, principal: Principal | null, orgId: string, rootLoopId: string): Promise<OrganizationMember[]> {
  z.uuid().parse(orgId); z.uuid().parse(rootLoopId);
  return db.tx(async q => {
    const actor = await firstParty(q, principal);
    const { rows: roots } = await q.query('select 1 from emba_loop where org_id=$1 and id=$2 and parent_id is null', [orgId, rootLoopId]);
    if (!roots.length) denied();
    await authority(q, actor, orgId, rootLoopId, 'owner');
    const { rows } = await q.query<OrganizationMember>(
      `select p.id as "personId",p.name from emba_membership m join person p on p.id=m.person_id
       where m.org_id=$1 and m.revoked_at is null and exists(select 1 from emba_identity i where i.person_id=m.person_id and i.revoked_at is null)
       and not exists(select 1 from emba_deletion_tombstone t where t.person_id=m.person_id)
       order by p.name,p.id`, [orgId],
    );
    await audit(q, actor, 'activity:write', orgId);
    return rows;
  });
}
export async function listScopedRoles(db: Db, principal: Principal | null, orgId: string, loopId: string): Promise<ScopedRole[]> {
  z.uuid().parse(orgId); z.uuid().parse(loopId);
  return db.tx(async q => {
    const actor = await firstParty(q, principal);
    await authority(q, actor, orgId, loopId, 'manager');
    const { rows } = await q.query<ScopedRole>(
      `with recursive ancestors as (
        select id,parent_id from emba_loop where org_id=$1 and id=$2
        union all select l.id,l.parent_id from emba_loop l join ancestors a on l.id=a.parent_id where l.org_id=$1
      ) select p.id as "personId",p.name,r0.role as "directRole",array_agg(distinct r.role)::text[] as "effectiveRoles"
        from ancestors a join emba_role r on r.org_id=$1 and r.loop_id=a.id and r.revoked_at is null
        join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id and m.revoked_at is null
        join person p on p.id=r.person_id
        left join emba_role r0 on r0.org_id=$1 and r0.loop_id=$2 and r0.person_id=p.id and r0.revoked_at is null
        where exists(select 1 from emba_identity i where i.person_id=p.id and i.revoked_at is null)
        and not exists(select 1 from emba_deletion_tombstone t where t.person_id=p.id)
        group by p.id,p.name,r0.role order by p.name,p.id`, [orgId, loopId],
    );
    await audit(q, actor, 'activity:write', loopId);
    return rows;
  });
}

export async function grantRole(db: Db, principal: Principal | null, input: unknown): Promise<void> {
  const scope = grantSchema.parse(input);
  await db.tx(async q => {
    await q.query('set transaction isolation level serializable');
    if (!principal || principal.clientId !== null) denied();
    await lockPeople(q, [principal.personId, scope.personId]);
    const actor = await firstParty(q, principal);
    await lockOrganization(q, scope.orgId);
    await authority(q, actor, scope.orgId, scope.loopId, scope.role === 'owner' || scope.role === 'organizer' ? 'owner' : 'manager');
    await activeMembership(q, scope, true);
    const { rows: [prior] } = await q.query<{ role: Role; revoked_at: string | null }>(
      'select role,revoked_at from emba_role where org_id=$1 and loop_id=$2 and person_id=$3 for update',
      [scope.orgId, scope.loopId, scope.personId],
    );
    if (prior?.revoked_at === null && (prior.role === 'owner' || prior.role === 'organizer')) {
      await authority(q, actor, scope.orgId, scope.loopId, 'owner');
    }
    if (prior?.revoked_at === null && prior.role === 'owner' && scope.role !== 'owner') await protectLastRootOwner(q, scope, prior.role);
    await q.query(
      `insert into emba_role (org_id,loop_id,person_id,role) values ($1,$2,$3,$4)
       on conflict (org_id,loop_id,person_id) do update set role=excluded.role,revoked_at=null`,
      [scope.orgId, scope.loopId, scope.personId, scope.role],
    );
    if (prior?.revoked_at === null && prior.role !== scope.role) await invalidate(q, scope);
    await audit(q, actor, 'activity:write', scope.loopId);
  });
  // A change to follower takes away write access: what the person held in that team is let go.
  await releaseAfterAccessChange(db, scope.personId, scope.orgId, principal!.personId);
}

export async function revokeRole(db: Db, principal: Principal | null, input: unknown): Promise<void> {
  const scope = scopeSchema.parse(input);
  await db.tx(async q => {
    await q.query('set transaction isolation level serializable');
    if (!principal || principal.clientId !== null) denied();
    await lockPeople(q, [principal.personId, scope.personId]);
    const actor = await firstParty(q, principal);
    await lockOrganization(q, scope.orgId);
    const { rows: [prior] } = await q.query<{ role: Role }>(
      'select role from emba_role where org_id=$1 and loop_id=$2 and person_id=$3 and revoked_at is null for update',
      [scope.orgId, scope.loopId, scope.personId],
    );
    if (!prior) denied();
    await authority(q, actor, scope.orgId, scope.loopId, prior.role === 'owner' || prior.role === 'organizer' ? 'owner' : 'manager');
    await protectLastRootOwner(q, scope, prior.role);
    await q.query('update emba_role set revoked_at=clock_timestamp() where org_id=$1 and loop_id=$2 and person_id=$3', [scope.orgId, scope.loopId, scope.personId]);
    await invalidate(q, scope);
    await audit(q, actor, 'activity:write', scope.loopId);
  });
  // If the change took away write access to a team, what the person held there is let go.
  await releaseAfterAccessChange(db, scope.personId, scope.orgId, principal!.personId);
}

export async function revokeMembership(db: Db, principal: Principal | null, input: unknown): Promise<void> {
  const { orgId, personId } = z.strictObject({ orgId: z.uuid(), personId: z.uuid() }).parse(input);
  await db.tx(async q => {
    await q.query('set transaction isolation level serializable');
    if (!principal || principal.clientId !== null) denied();
    await lockPeople(q, [principal.personId, personId]);
    const actor = await firstParty(q, principal);
    await lockOrganization(q, orgId);
    const { rows: roots } = await q.query<{ id: string }>('select id from emba_loop where org_id=$1 and parent_id is null order by id', [orgId]);
    if (!roots.length) denied();
    if (actor.personId !== personId) {
      let ownsRoot = false;
      for (const root of roots) {
        try { await authority(q, actor, orgId, root.id, 'owner'); ownsRoot = true; break; }
        catch (error) { if (!(error instanceof EmbaError) || error.code !== 'forbidden') throw error; }
      }
      if (!ownsRoot) denied();
    }
    const scope = { orgId, loopId: roots[0].id, personId };
    await activeMembership(q, scope, false);
    for (const root of roots) {
      const rootScope = { orgId, loopId: root.id, personId };
      const { rows: [rootRole] } = await q.query<{ role: Role }>(
        `select role from emba_role where org_id=$1 and loop_id=$2 and person_id=$3 and revoked_at is null for update`,
        [orgId, root.id, personId],
      );
      await protectLastRootOwner(q, rootScope, rootRole?.role ?? null);
    }
    await q.query('update emba_membership set revoked_at=clock_timestamp() where org_id=$1 and person_id=$2', [orgId, personId]);
    // A person who left can no longer be tagged, and their name becomes available.
    await q.query('delete from emba_member_handle where org_id=$1 and person_id=$2', [orgId, personId]);
    await invalidate(q, scope);
    await audit(q, actor, 'activity:write', orgId);
  });
  // Their open claims are released, proposals for them declined, and tags on them removed.
  await releaseAfterAccessChange(db, personId, orgId, principal!.personId);
}
