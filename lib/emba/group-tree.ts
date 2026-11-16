import 'server-only';
import { z, ZodError } from 'zod';
import type { Db, Q } from '../db';
import { canAccessLoop, type Principal } from './access';
import { audit, requireFirstParty } from './consent';
import { EmbaError } from './errors';
import { listPortalGroups, type GroupAddress } from './groups';
import { organizerVia, OrganizeRefused } from './team-core';

/** Words the site's own routes use under a group; `workspace` is every root's slug. */
export const RESERVED_SLUGS = ['workspace', 'team', 'resources', 'in', 'new'];
// A slug is one segment of the loop path, so it follows the path's rule (no doubled or trailing hyphen) as well as the handle's length.
export const innerSlug = z.string().min(2).max(48).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const innerSchema = z.strictObject({
  orgId: z.uuid(), parentLoopId: z.uuid(),
  name: z.string().trim().min(1).max(200), description: z.string().trim().max(1000), slug: innerSlug,
});

/**
 * Starts a group inside a group, for a person who can manage the parent (directly or from above): on the site, or
 * through their assistant when it holds a read-and-write grant that covers the parent.
 * The handle is @namespace/slug whatever the depth: the namespace's one set of names decides whether the slug is free.
 */
export async function createInnerGroup(db: Db, p: Principal, input: unknown): Promise<GroupAddress> {
  const data = innerSchema.parse(input);
  if (RESERVED_SLUGS.includes(data.slug)) throw new EmbaError('conflict');
  try {
    return await db.tx(async q => {
      await q.query('set transaction isolation level serializable');
      const lease = await organizerVia(q, p, { orgId: data.orgId, loopId: data.parentLoopId });
      if (!await canAccessLoop(q, p, data.orgId, data.parentLoopId, 'manage')) throw new OrganizeRefused('organizers_only');
      // The parent must itself be a live, addressed group: nothing hangs under a retired one.
      const { rows: [parent] } = await q.query<{ path: string; namespace: string }>(`select l.path,a.namespace from emba_loop l
        join emba_group_address a on a.org_id=l.org_id and a.loop_id=l.id and a.retired_at is null
        where l.org_id=$1 and l.id=$2 for share of l,a`, [data.orgId, data.parentLoopId]);
      if (!parent) throw new EmbaError('forbidden');
      const path = `${parent.path}/${data.slug}`;
      if (path.length > 500) throw new EmbaError('conflict');
      const { rows: [loop] } = await q.query<{ id: string }>(
        'insert into emba_loop(org_id,parent_id,path,name,description) values($1,$2,$3,$4,$5) returning id',
        [data.orgId, data.parentLoopId, path, data.name, data.description || null]);
      await q.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'owner')", [data.orgId, loop.id, p.personId]);
      await q.query('insert into emba_group_address(org_id,loop_id,namespace,slug) values($1,$2,$3,$4)', [data.orgId, loop.id, parent.namespace, data.slug]);
      await audit(q, p, 'activity:write', loop.id, lease);
      return { orgId: data.orgId, loopId: loop.id, namespace: parent.namespace, slug: data.slug, handle: `@${parent.namespace}/${data.slug}`, orgName: data.name, loopPath: path };
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw new EmbaError('conflict');
    throw error;
  }
}

const groupSchema = z.strictObject({ orgId: z.uuid(), loopId: z.uuid() });
const renameSchema = groupSchema.extend({ name: z.string().trim().min(1).max(200) });
type GroupScope = z.infer<typeof groupSchema>;
/** What a rename, an archive or a restore did, in the words people use for the group. `inside` counts the groups under it that went with it. */
export type GroupChange = { handle: string; name: string };
export type GroupFold = GroupChange & { inside: number };
type Held = { root: boolean; archived: boolean; under: boolean; handle: string; name: string };

/** The group as it stands, with its address held until the transaction ends. `under` says the group it sits in is archived. */
async function hold(q: Q, data: GroupScope): Promise<Held | undefined> {
  const { rows: [row] } = await q.query<Held>(`select l.parent_id is null as root,a.retired_at is not null as archived,coalesce(l.name,o.name) as name,
      case when l.parent_id is null then '@'||a.namespace else '@'||a.namespace||'/'||a.slug end as handle,
      exists(select 1 from emba_group_address pa where pa.org_id=l.org_id and pa.loop_id=l.parent_id and pa.retired_at is not null) as under
    from emba_loop l join emba_group_address a on a.org_id=l.org_id and a.loop_id=l.id join emba_organization o on o.id=l.org_id
    where l.org_id=$1 and l.id=$2 for update of a`, [data.orgId, data.loopId]);
  return row;
}
/**
 * The checks a rename and an archive share. On the site, or through an assistant with a read-and-write grant that
 * covers the group; an assistant changes nothing about a top-level group. Renaming, and archiving a group inside
 * another, are for whoever runs the group, directly or from above; archiving a top-level group is for its owner.
 */
async function organizing(q: Q, p: Principal, data: GroupScope, act: 'rename' | 'archive') {
  await q.query('set transaction isolation level serializable');
  const lease = await organizerVia(q, p, data);
  const group = await hold(q, data);
  if (group?.root && p.clientId !== null) throw new OrganizeRefused('site_only');
  if (!await canAccessLoop(q, p, data.orgId, data.loopId, group?.root && act === 'archive' ? 'delegate_organizer' : 'manage')) throw new OrganizeRefused('organizers_only');
  if (!group || group.archived) throw new EmbaError('not_found');
  return { group, lease };
}
/** Every group under `$2` in organization `$1`, itself included. */
const DOWN = `with recursive down as (select id from emba_loop where org_id=$1 and id=$2
  union all select l.id from emba_loop l join down on l.parent_id=down.id where l.org_id=$1)`;

/** Changes a group's name and nothing else: its handle, its address and every link to it stay (design D2). */
export async function renameGroup(db: Db, p: Principal, input: unknown): Promise<GroupChange> {
  const data = renameSchema.parse(input);
  try {
    return await db.tx(async q => {
      const { group, lease } = await organizing(q, p, data, 'rename');
      // A top-level group has no name of its own in the loop table: its name is its organization's.
      if (group.root) await q.query('update emba_organization set name=$2 where id=$1', [data.orgId, data.name]);
      else await q.query('update emba_loop set name=$3 where org_id=$1 and id=$2', [data.orgId, data.loopId, data.name]);
      await audit(q, p, 'activity:write', data.loopId, lease);
      return { handle: group.handle, name: data.name };
    });
  } catch (error) {
    // A database rule refused the name (a control character, say). Its message quotes the row, so it is replaced.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23514') throw new ZodError([]);
    throw error;
  }
}

/**
 * Hides a group and every group under it, in one act with one timestamp, and ends every assistant grant made on
 * any of them; a grant on a group above is untouched. Nothing is deleted (design D3, D4).
 */
export async function archiveGroup(db: Db, p: Principal, input: unknown): Promise<GroupFold> {
  const data = groupSchema.parse(input);
  return db.tx(async q => {
    const { group, lease } = await organizing(q, p, data, 'archive');
    const { rows } = await q.query<{ loopId: string }>(`${DOWN}, stamp as materialized (select clock_timestamp() as at)
      update emba_group_address a set retired_at=stamp.at from down,stamp where a.org_id=$1 and a.loop_id=down.id and a.retired_at is null
      returning a.loop_id as "loopId"`, [data.orgId, data.loopId]);
    // Set after retired_at, so listRemovedGroupGrants can tell these from a grant its person ended earlier.
    await q.query('update emba_lease set revoked_at=clock_timestamp() where org_id=$1 and loop_id=any($2::uuid[]) and revoked_at is null', [data.orgId, rows.map(row => row.loopId)]);
    await audit(q, p, 'activity:write', data.loopId, lease);
    return { handle: group.handle, name: group.name, inside: rows.length - 1 };
  });
}

/**
 * Brings back an archived group with the groups that were archived in the same act. A group under it that was
 * archived on its own earlier stays archived. Site only, for the people who may archive it, and not while the group
 * it sits in is archived. Grants that archiving ended stay ended.
 */
export async function restoreGroup(db: Db, p: Principal, input: unknown): Promise<GroupFold> {
  const data = groupSchema.parse(input);
  return db.tx(async q => {
    await q.query('set transaction isolation level serializable');
    await requireFirstParty(q, p);
    const group = await hold(q, data);
    if (!await canAccessLoop(q, p, data.orgId, data.loopId, group?.root ? 'delegate_organizer' : 'manage')) throw new OrganizeRefused('organizers_only');
    if (!group || !group.archived) throw new EmbaError('not_found');
    if (group.under) throw new EmbaError('conflict');
    const { rows } = await q.query(`${DOWN} update emba_group_address a set retired_at=null from down where a.org_id=$1 and a.loop_id=down.id
      and a.retired_at=(select retired_at from emba_group_address where org_id=$1 and loop_id=$2) returning a.loop_id`, [data.orgId, data.loopId]);
    await audit(q, p, 'activity:write', data.loopId);
    return { handle: group.handle, name: group.name, inside: rows.length - 1 };
  });
}

/** An archived group the person may restore. */
export type ArchivedGroup = GroupFold & { orgId: string; loopId: string; archivedAt: string | Date };
/**
 * The archived groups the person may restore now, newest first, in one statement: those not sitting in an archived
 * group, where the person owns the top-level group or runs the group inside one. It checks the person's roles and
 * sign-in itself and names nothing to anyone else. Site only.
 */
export async function listArchivedGroups(db: Db, p: Principal): Promise<ArchivedGroup[]> {
  if (p.clientId !== null || p.expiresAt <= Date.now()) throw new EmbaError('forbidden');
  const { rows } = await db.query<ArchivedGroup>(`select a.org_id as "orgId",a.loop_id as "loopId",coalesce(l.name,o.name) as name,a.retired_at as "archivedAt",
      case when l.parent_id is null then '@'||a.namespace else '@'||a.namespace||'/'||a.slug end as handle,
      (with recursive down as (select id from emba_loop where org_id=a.org_id and parent_id=l.id
         union all select c.id from emba_loop c join down on c.parent_id=down.id where c.org_id=a.org_id)
       select count(*)::int from down join emba_group_address d on d.org_id=a.org_id and d.loop_id=down.id and d.retired_at=a.retired_at) as inside
    from emba_group_address a join emba_loop l on l.org_id=a.org_id and l.id=a.loop_id join emba_organization o on o.id=a.org_id
    where a.retired_at is not null
     and not exists(select 1 from emba_group_address pa where pa.org_id=a.org_id and pa.loop_id=l.parent_id and pa.retired_at is not null)
     and exists(with recursive up as (select id,parent_id from emba_loop where org_id=a.org_id and id=l.id
         union all select x.id,x.parent_id from emba_loop x join up on x.id=up.parent_id where x.org_id=a.org_id)
       select 1 from up join emba_role r on r.org_id=a.org_id and r.loop_id=up.id and r.person_id=$1 and r.revoked_at is null
         and (r.role='owner' or (r.role='organizer' and l.parent_id is not null))
        join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id and m.revoked_at is null
        join emba_identity i on i.person_id=r.person_id and i.issuer=$2 and i.subject=$3 and i.revoked_at is null
        where not exists(select 1 from emba_deletion_tombstone t where t.person_id=r.person_id))
    order by a.retired_at desc,a.loop_id limit 50`, [p.personId, p.issuer, p.subject]);
  return rows;
}

const TREE_LIMIT = 300;
/** A group the person can open, as a node of their tree. */
export type TreeGroup = GroupAddress & {
  /** The group this one is inside, or null when it is a root or the person cannot open what it is inside. */
  parentLoopId: string | null;
  /** Whether the person runs this group, directly or from above: they may start a group inside it and rename it. */
  canStart: boolean;
  /** Whether the person may archive it: whoever runs a group inside another, and only the owner of a top-level group. */
  canArchive: boolean;
};

/**
 * Every group the signed-in person can open, with where it hangs. A parent the person cannot open is never named:
 * the group simply hangs at the top.
 */
export async function listGroupTree(db: Db, p: Principal): Promise<TreeGroup[]> {
  // Every page finds its group in this list, so it must hold a whole cohort's tree, not one screen of it.
  const groups = await listPortalGroups(db, p, TREE_LIMIT);
  if (!groups.length) return [];
  const open = new Set(groups.map(group => group.loopId));
  // `runs` and `owns` come from one walk up: a role of owner or organizer anywhere on the way, and the owner's role on the group itself.
  const { rows } = await db.query<{ id: string; parentId: string | null; canStart: boolean; canArchive: boolean }>(`select l.id,l.parent_id as "parentId",
    f.runs as "canStart",case when l.parent_id is null then f.owns else f.runs end as "canArchive"
    from emba_loop l cross join lateral (
     with recursive up as (select id,parent_id from emba_loop where org_id=l.org_id and id=l.id
       union all select x.id,x.parent_id from emba_loop x join up on x.id=up.parent_id where x.org_id=l.org_id)
     select count(*)>0 as runs,coalesce(bool_or(up.id=l.id and r.role='owner'),false) as owns
      from up join emba_role r on r.org_id=l.org_id and r.loop_id=up.id and r.person_id=$1 and r.revoked_at is null and r.role in ('owner','organizer')
      join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id and m.revoked_at is null) f
    where l.id=any($2::uuid[])`, [p.personId, [...open]]);
  const facts = new Map(rows.map(row => [row.id, row]));
  return groups.map(group => {
    const fact = facts.get(group.loopId);
    return { ...group, parentLoopId: fact?.parentId && open.has(fact.parentId) ? fact.parentId : null, canStart: fact?.canStart ?? false, canArchive: fact?.canArchive ?? false };
  });
}
