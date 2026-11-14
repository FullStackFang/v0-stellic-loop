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
    where a.org_id=$1 and a.loop_id=$2 and a.retired_at is null for share of a,l`, [scope.orgId, scope.loopId]);
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
      enabled_at=clock_timestamp(),disabled_at=null,
      join_mode=case when emba_group_request_link.disabled_at is null then emba_group_request_link.join_mode else 'ask_first' end`, [scope.orgId, scope.loopId, hashToken(token), publicLabel]);
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
  const { rows: [row] } = await db.query<{ groupName: string; description: string; publicLabel: string; joinMode: JoinMode }>(
    `select coalesce((select g.name from emba_loop g where g.org_id=l.org_id and g.id=l.loop_id),o.name) as "groupName",
      (select case when g.parent_id is null then o.description else coalesce(g.description,'') end from emba_loop g where g.org_id=l.org_id and g.id=l.loop_id) as description,l.public_label as "publicLabel",l.join_mode as "joinMode"
     from emba_group_request_link l join emba_organization o on o.id=l.org_id
     join emba_group_address a on a.org_id=l.org_id and a.loop_id=l.loop_id
     where l.token_hash=$1 and l.disabled_at is null and a.retired_at is null`, [hashToken(token)]);
  if (!row) throw new EmbaError('not_found');
  return row;
}
/** Ask first: an organizer approves each request. Admit: a signed-in person who confirms becomes a member at once. */
export async function setJoinMode(db: Db, principal: Principal, input: unknown): Promise<void> {
  const { mode, ...scope } = scopeSchema.extend({ mode: z.enum(['ask_first', 'admit']) }).parse(input);
  await db.tx(async q => {
    await manager(q, principal, scope);
    const { rows } = await q.query('update emba_group_request_link set join_mode=$3 where org_id=$1 and loop_id=$2 and disabled_at is null returning 1', [scope.orgId, scope.loopId, mode]);
    if (!rows.length) throw new EmbaError('not_found');
    await audit(q, principal, 'activity:write', scope.loopId);
  });
}
/** For the group's owners and organizers: the mode of the join link, or null while the link is off. */
export async function joinLinkMode(db: Db, principal: Principal, input: unknown): Promise<JoinMode | null> {
  const scope = scopeSchema.parse(input);
  return db.tx(async q => {
    await manager(q, principal, scope);
    const { rows: [link] } = await q.query<{ mode: JoinMode }>('select join_mode as mode from emba_group_request_link where org_id=$1 and loop_id=$2 and disabled_at is null', [scope.orgId, scope.loopId]);
    return link?.mode ?? null;
  });
}
/** A new join link in place of the current one, which stops working at once. The mode and label stay. */
export async function replaceJoinLink(db: Db, principal: Principal, input: unknown): Promise<string> {
  const scope = scopeSchema.parse(input);
  const token = magicToken();
  await db.tx(async q => {
    await manager(q, principal, scope);
    const { rows } = await q.query('update emba_group_request_link set token_hash=$3,enabled_at=clock_timestamp() where org_id=$1 and loop_id=$2 and disabled_at is null returning 1', [scope.orgId, scope.loopId, hashToken(token)]);
    if (!rows.length) throw new EmbaError('not_found');
    await audit(q, principal, 'activity:write', scope.loopId);
  });
  return token;
}

type JoinMode = 'ask_first' | 'admit';
/** What happened when a signed-in person took a group's join step. */
export type JoinOutcome = { outcome: 'joined' | 'requested' | 'contact_organizer'; namespace: string; slug: string };
// Each names the group's current join link from one parameter: the link's own token hash, or the share token of an event or ask of that group.
const links = {
  join: 'l.token_hash=$1',
  event: 'exists(select 1 from emba_team_event e where e.org_id=l.org_id and e.loop_id=l.loop_id and e.share_token=$1 and e.archived_at is null and e.starts_at is not null)',
  ask: 'exists(select 1 from emba_ask k where k.org_id=l.org_id and k.loop_id=l.loop_id and k.share_token=$1)',
} as const;
/** Whether a live role on the group, or on a group above it, already opens it to the person. */
const reaches = `exists(with recursive up as (select id,parent_id from emba_loop where org_id=$1 and id=$2
  union all select x.id,x.parent_id from emba_loop x join up on x.id=up.parent_id where x.org_id=$1)
  select 1 from up join emba_role r on r.org_id=$1 and r.loop_id=up.id and r.person_id=$3 and r.revoked_at is null)`;
/** Where the person stands with the group and with the top-level group it belongs to. */
async function standing(q: Q, scope: Scope, personId: string) {
  const { rows: [row] } = await q.query<{ membership: 'live' | 'revoked' | null; reaches: boolean; removedHere: boolean }>(`select
    (select case when m.revoked_at is null then 'live' else 'revoked' end from emba_membership m where m.org_id=$1 and m.person_id=$3) as membership,
    ${reaches} as reaches,
    exists(with recursive up as (select id,parent_id from emba_loop where org_id=$1 and id=$2
      union all select x.id,x.parent_id from emba_loop x join up on x.id=up.parent_id where x.org_id=$1)
      select 1 from up join emba_role r on r.org_id=$1 and r.loop_id=up.id and r.person_id=$3 and r.revoked_at is not null) as "removedHere"`, [scope.orgId, scope.loopId, personId]);
  return row;
}
/**
 * The join step, by the group's mode. Admission makes a member and nothing
 * more: never an owner or organizer, and no assistant grant. A person who
 * was in the group before is not admitted again; an organizer can add them.
 */
async function join(db: Db, principal: Principal, by: keyof typeof links, value: string): Promise<JoinOutcome> {
  return db.tx(async q => {
    await q.query('set transaction isolation level serializable');
    await q.query('select id from person where id=$1 for update', [principal.personId]);
    await requireFirstParty(q, principal);
    const { rows: [link] } = await q.query<Scope & { mode: JoinMode; namespace: string; slug: string }>(`select l.org_id as "orgId",l.loop_id as "loopId",l.join_mode as mode,a.namespace,a.slug from emba_group_request_link l
      join emba_group_address a on a.org_id=l.org_id and a.loop_id=l.loop_id
      where ${links[by]} and l.disabled_at is null and a.retired_at is null for share of l,a`, [value]);
    if (!link) throw new EmbaError('not_found');
    if (link.mode === 'admit') await q.query('select id from emba_organization where id=$1 for update', [link.orgId]);
    // A group inside a group shares its top-level group's membership: a person in a sibling group is a live member
    // who cannot open this one yet. Only someone the group is already open to has nothing to join.
    const at = await standing(q, link, principal.personId);
    if (at.membership === 'live' && at.reaches) throw new EmbaError('conflict');
    if (link.mode === 'admit') {
      // Removed from the whole group, from this one, or from a group above it: the link does not bring them back.
      if (at.membership === 'revoked' || at.removedHere) return { outcome: 'contact_organizer' as const, namespace: link.namespace, slug: link.slug };
      const { rows: identities } = await q.query('select 1 from emba_identity where person_id=$1 and revoked_at is null', [principal.personId]);
      if (!identities.length) throw new EmbaError('forbidden');
      if (!at.membership) await q.query('insert into emba_membership(org_id,person_id) values($1,$2)', [link.orgId, principal.personId]);
      await q.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')", [link.orgId, link.loopId, principal.personId]);
      await q.query("update emba_group_membership_request set state='approved',reviewed_at=clock_timestamp() where org_id=$1 and loop_id=$2 and person_id=$3 and state='pending'", [link.orgId, link.loopId, principal.personId]);
      await audit(q, principal, 'activity:write', link.loopId);
      return { outcome: 'joined' as const, namespace: link.namespace, slug: link.slug };
    }
    await q.query(`insert into emba_group_membership_request(org_id,loop_id,person_id,state) values($1,$2,$3,'pending')
      on conflict(org_id,loop_id,person_id) do update set state='pending',requested_at=clock_timestamp(),reviewed_at=null,reviewed_by=null
      where emba_group_membership_request.state='declined'`, [link.orgId, link.loopId, principal.personId]);
    const { rows: [request] } = await q.query<{ state: string }>('select state from emba_group_membership_request where org_id=$1 and loop_id=$2 and person_id=$3', [link.orgId, link.loopId, principal.personId]);
    if (request?.state !== 'pending') throw new EmbaError('conflict');
    await audit(q, principal, 'activity:write', link.loopId);
    return { outcome: 'requested' as const, namespace: link.namespace, slug: link.slug };
  });
}
export async function requestMembership(db: Db, principal: Principal, token: string): Promise<JoinOutcome> {
  return join(db, principal, 'join', hashToken(tokenSchema.parse(token)));
}
/** The same join step, reached from an event's or an ask's share link. The share token names the group; it admits nobody where the group's join link is off. */
export async function joinFromShare(db: Db, principal: Principal, input: unknown): Promise<JoinOutcome> {
  const { kind, token } = z.strictObject({ kind: z.enum(['event', 'ask']), token: z.string().regex(/^[0-9a-f]{32}$/) }).parse(input);
  return join(db, principal, kind, token);
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
      const at = await standing(q, data, data.personId);
      if (at.membership === 'live' && at.reaches) throw new EmbaError('conflict');
      if (at.membership !== 'live') {
        // Coming back after removal brings this one role, not the roles held before.
        await q.query('insert into emba_membership(org_id,person_id) values($1,$2) on conflict(org_id,person_id) do update set revoked_at=null,joined_at=clock_timestamp()', [data.orgId, data.personId]);
        await q.query('update emba_role set revoked_at=coalesce(revoked_at,clock_timestamp()) where org_id=$1 and person_id=$2', [data.orgId, data.personId]);
      }
      await q.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member') on conflict(org_id,loop_id,person_id) do update set role='member',revoked_at=null", [data.orgId, data.loopId, data.personId]);
    }
    await q.query('update emba_group_membership_request set state=$4,reviewed_at=clock_timestamp(),reviewed_by=$5 where org_id=$1 and loop_id=$2 and person_id=$3', [data.orgId, data.loopId, data.personId, data.decision === 'approve' ? 'approved' : 'declined', principal.personId]);
    await audit(q, principal, 'activity:write', data.loopId);
  });
}
