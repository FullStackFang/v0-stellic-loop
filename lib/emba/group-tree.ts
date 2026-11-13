import 'server-only';
import { z } from 'zod';
import type { Db } from '../db';
import { canAccessLoop, type Principal } from './access';
import { audit, requireFirstParty } from './consent';
import { EmbaError } from './errors';
import { listPortalGroups, type GroupAddress } from './groups';

/** Words the site's own routes use under a group; `workspace` is every root's slug. */
export const RESERVED_SLUGS = ['workspace', 'team', 'resources', 'in', 'new'];
// A slug is one segment of the loop path, so it follows the path's rule (no doubled or trailing hyphen) as well as the handle's length.
export const innerSlug = z.string().min(2).max(48).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const innerSchema = z.strictObject({
  orgId: z.uuid(), parentLoopId: z.uuid(),
  name: z.string().trim().min(1).max(200), description: z.string().trim().max(1000), slug: innerSlug,
});

/**
 * Starts a group inside a group. Site only, and only for a person who can manage the parent (directly or from above).
 * The handle is @namespace/slug whatever the depth: the namespace's one set of names decides whether the slug is free.
 */
export async function createInnerGroup(db: Db, p: Principal, input: unknown): Promise<GroupAddress> {
  const data = innerSchema.parse(input);
  if (RESERVED_SLUGS.includes(data.slug)) throw new EmbaError('conflict');
  try {
    return await db.tx(async q => {
      await q.query('set transaction isolation level serializable');
      await requireFirstParty(q, p);
      if (!await canAccessLoop(q, p, data.orgId, data.parentLoopId, 'manage')) throw new EmbaError('forbidden');
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
      await audit(q, p, 'activity:write', loop.id);
      return { orgId: data.orgId, loopId: loop.id, namespace: parent.namespace, slug: data.slug, handle: `@${parent.namespace}/${data.slug}`, orgName: data.name, loopPath: path };
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw new EmbaError('conflict');
    throw error;
  }
}

const TREE_LIMIT = 300;
/** A group the person can open, as a node of their tree. */
export type TreeGroup = GroupAddress & {
  /** The group this one is inside, or null when it is a root or the person cannot open what it is inside. */
  parentLoopId: string | null;
  /** Whether the person may start a group inside this one. */
  canStart: boolean;
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
  const { rows } = await db.query<{ id: string; parentId: string | null; canStart: boolean }>(`select l.id,l.parent_id as "parentId",
    exists(with recursive up as (select id,parent_id from emba_loop where org_id=l.org_id and id=l.id
       union all select x.id,x.parent_id from emba_loop x join up on x.id=up.parent_id where x.org_id=l.org_id)
     select 1 from up join emba_role r on r.org_id=l.org_id and r.loop_id=up.id and r.person_id=$1 and r.revoked_at is null and r.role in ('owner','organizer')
      join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id and m.revoked_at is null) as "canStart"
    from emba_loop l where l.id=any($2::uuid[])`, [p.personId, [...open]]);
  const facts = new Map(rows.map(row => [row.id, row]));
  return groups.map(group => {
    const fact = facts.get(group.loopId);
    return { ...group, parentLoopId: fact?.parentId && open.has(fact.parentId) ? fact.parentId : null, canStart: fact?.canStart ?? false };
  });
}
