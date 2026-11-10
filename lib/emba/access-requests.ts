import 'server-only';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { hashToken, magicToken } from '../tokens';
import { canAccessLoop, type Principal } from './access';
import { audit, requireFirstParty } from './consent';
import { EmbaError } from './errors';

const scopeSchema = z.strictObject({ orgId: z.uuid(), loopId: z.uuid() });
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
type Scope = z.infer<typeof scopeSchema>;

async function owner(q: Q, principal: Principal, scope: Scope) {
  await requireFirstParty(q, principal);
  if (!await canAccessLoop(q, principal, scope.orgId, scope.loopId, 'delegate_organizer')) throw new EmbaError('forbidden');
  const { rows } = await q.query(`select 1 from emba_group_address a join emba_loop l on l.org_id=a.org_id and l.id=a.loop_id
    where a.org_id=$1 and a.loop_id=$2 and l.parent_id is null and a.retired_at is null for share of a,l`, [scope.orgId, scope.loopId]);
  if (!rows.length) throw new EmbaError('forbidden');
}
async function manager(q: Q, principal: Principal, scope: Scope) {
  await requireFirstParty(q, principal);
  if (!await canAccessLoop(q, principal, scope.orgId, scope.loopId, 'manage')) throw new EmbaError('forbidden');
}

export async function enableAccessRequests(db: Db, principal: Principal, input: unknown): Promise<string> {
  const { publicLabel, ...scope } = scopeSchema.extend({ publicLabel: z.string().trim().max(120) }).parse(input);
  const token = magicToken();
  await db.tx(async q => {
    await owner(q, principal, scope);
    await q.query(`insert into emba_group_request_link(org_id,loop_id,token_hash,public_label) values($1,$2,$3,$4)
      on conflict(org_id,loop_id) do update set token_hash=excluded.token_hash,public_label=excluded.public_label,
      enabled_at=clock_timestamp(),disabled_at=null`, [scope.orgId, scope.loopId, hashToken(token), publicLabel]);
    await audit(q, principal, 'activity:write', scope.loopId);
  });
  return token;
}
export async function disableAccessRequests(db: Db, principal: Principal, input: unknown): Promise<void> {
  const scope = scopeSchema.parse(input);
  await db.tx(async q => {
    await owner(q, principal, scope);
    await q.query('update emba_group_request_link set disabled_at=clock_timestamp() where org_id=$1 and loop_id=$2', [scope.orgId, scope.loopId]);
    await audit(q, principal, 'activity:write', scope.loopId);
  });
}
export async function accessRequestPreview(db: Db, token: string) {
  tokenSchema.parse(token);
  const { rows: [row] } = await db.query<{ groupName: string; description: string; publicLabel: string }>(
    `select o.name as "groupName",o.description,l.public_label as "publicLabel"
     from emba_group_request_link l join emba_organization o on o.id=l.org_id
     join emba_group_address a on a.org_id=l.org_id and a.loop_id=l.loop_id
     where l.token_hash=$1 and l.disabled_at is null and a.retired_at is null`, [hashToken(token)]);
  if (!row) throw new EmbaError('not_found');
  return row;
}
export async function requestMembership(db: Db, principal: Principal, token: string): Promise<void> {
  tokenSchema.parse(token);
  await db.tx(async q => {
    await q.query('set transaction isolation level serializable');
    await requireFirstParty(q, principal);
    const { rows: [link] } = await q.query<Scope>(`select l.org_id as "orgId",l.loop_id as "loopId" from emba_group_request_link l
      join emba_group_address a on a.org_id=l.org_id and a.loop_id=l.loop_id
      where l.token_hash=$1 and l.disabled_at is null and a.retired_at is null for share of l,a`, [hashToken(token)]);
    if (!link) throw new EmbaError('not_found');
    const { rows: members } = await q.query('select 1 from emba_membership where org_id=$1 and person_id=$2 and revoked_at is null', [link.orgId, principal.personId]);
    if (members.length) throw new EmbaError('conflict');
    await q.query(`insert into emba_group_membership_request(org_id,loop_id,person_id,state) values($1,$2,$3,'pending')
      on conflict(org_id,loop_id,person_id) do update set state='pending',requested_at=clock_timestamp(),reviewed_at=null,reviewed_by=null
      where emba_group_membership_request.state='declined'`, [link.orgId, link.loopId, principal.personId]);
    const { rows: [request] } = await q.query<{ state: string }>('select state from emba_group_membership_request where org_id=$1 and loop_id=$2 and person_id=$3', [link.orgId, link.loopId, principal.personId]);
    if (request?.state !== 'pending') throw new EmbaError('conflict');
    await audit(q, principal, 'activity:write', link.loopId);
  });
}
export async function listMembershipRequests(db: Db, principal: Principal, input: unknown) {
  const scope = scopeSchema.parse(input);
  return db.tx(async q => {
    await manager(q, principal, scope);
    const { rows } = await q.query<{ personId: string; name: string; requestedAt: string }>(
      `select r.person_id as "personId",p.name,r.requested_at as "requestedAt" from emba_group_membership_request r
       join person p on p.id=r.person_id where r.org_id=$1 and r.loop_id=$2 and r.state='pending'
       order by r.requested_at limit 100 for share of r,p`, [scope.orgId, scope.loopId]);
    await audit(q, principal, 'plan:read', scope.loopId);
    if (!await canAccessLoop(q, principal, scope.orgId, scope.loopId, 'manage')) throw new EmbaError('forbidden');
    return rows;
  });
}
export async function reviewMembershipRequest(db: Db, principal: Principal, input: unknown): Promise<void> {
  const data = scopeSchema.extend({ personId: z.uuid(), decision: z.enum(['approve', 'decline']) }).parse(input);
  await db.tx(async q => {
    await q.query('set transaction isolation level serializable');
    await q.query('select id from person where id=$1 for update', [data.personId]);
    await q.query('select id from emba_organization where id=$1 for update', [data.orgId]);
    await manager(q, principal, data);
    const { rows: [request] } = await q.query<{ state: string }>(
      'select state from emba_group_membership_request where org_id=$1 and loop_id=$2 and person_id=$3 for update', [data.orgId, data.loopId, data.personId]);
    if (request?.state !== 'pending') throw new EmbaError('conflict');
    if (data.decision === 'approve') {
      const { rows: identities } = await q.query('select 1 from emba_identity where person_id=$1 and revoked_at is null', [data.personId]);
      if (!identities.length) throw new EmbaError('forbidden');
      const { rows: active } = await q.query('select 1 from emba_membership where org_id=$1 and person_id=$2 and revoked_at is null', [data.orgId, data.personId]);
      if (active.length) throw new EmbaError('conflict');
      await q.query('insert into emba_membership(org_id,person_id) values($1,$2) on conflict(org_id,person_id) do update set revoked_at=null,joined_at=clock_timestamp()', [data.orgId, data.personId]);
      await q.query('update emba_role set revoked_at=clock_timestamp() where org_id=$1 and person_id=$2', [data.orgId, data.personId]);
      await q.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member') on conflict(org_id,loop_id,person_id) do update set role='member',revoked_at=null", [data.orgId, data.loopId, data.personId]);
    }
    await q.query('update emba_group_membership_request set state=$4,reviewed_at=clock_timestamp(),reviewed_by=$5 where org_id=$1 and loop_id=$2 and person_id=$3', [data.orgId, data.loopId, data.personId, data.decision === 'approve' ? 'approved' : 'declined', principal.personId]);
    await audit(q, principal, 'activity:write', data.loopId);
  });
}
