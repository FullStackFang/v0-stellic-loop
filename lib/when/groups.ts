import type { Db, Q } from '../db';
import { canAccessLoop, type Principal } from '../emba/access';
import { addressedScope } from '../emba/groups';
import { ROOT_SLUG, groupPath } from '../emba/group-path';
import { iso } from './polls';

// Loopd When: a poll started from a group belongs to it (supabase/migrations/20261123010000_when_group.sql).
// Anyone with the poll's address can still answer. The group's page lists its polls to those who can read the group.

export type Scope = { orgId: string; loopId: string };
/** A group a poll is for: where its page is, what it is called, and how many people are in it. */
export type PollGroup = { scope: Scope; ref: string; name: string; href: string; size: number };
/** A group's poll as its card on the group's page shows it. */
export type GroupPoll = { id: string; title: string; status: 'open' | 'sent'; deadline: string; chosenSlot: string | null; durationMin: number; timezone: string; organizerName: string;
  /** How many have answered, and the group's size. */ answered: number; size: number; /** The viewer's own answer counts. */ mine: boolean;
  /** The viewer made it, and it has told them a time works or its deadline passed: theirs to pick. */ isOrganizer: boolean; ready: boolean };

/** The table is made by hand on the live database. Until it is, no poll has a group. */
const absent = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01';
const ACTIVE = `r.revoked_at is null and r.role<>'follower' and exists(select 1 from emba_membership m where m.org_id=r.org_id and m.person_id=r.person_id and m.revoked_at is null)`;

async function named(q: Q, scope: Scope): Promise<Omit<PollGroup, 'scope'> | null> {
  const { rows: [row] } = await q.query<{ namespace: string; slug: string; name: string; size: number }>(`select a.namespace,a.slug,coalesce(l.name,o.name) as name,
    (select count(distinct r.person_id)::int from emba_role r where r.org_id=a.org_id and r.loop_id=a.loop_id and ${ACTIVE}) as size
    from emba_group_address a join emba_organization o on o.id=a.org_id join emba_loop l on l.org_id=a.org_id and l.id=a.loop_id
    where a.org_id=$1 and a.loop_id=$2 and a.retired_at is null`, [scope.orgId, scope.loopId]);
  return row ? { ref: row.slug === ROOT_SLUG ? row.namespace : `${row.namespace}/${row.slug}`, name: row.name, href: groupPath(row.namespace, row.slug), size: row.size } : null;
}

/** The group written as "namespace" or "namespace/slug", if this person may post in it. */
export async function groupByRef(db: Db, p: Principal, ref: string): Promise<PollGroup | null> {
  const [namespace, slug = ROOT_SLUG, ...rest] = ref.split('/');
  if (rest.length || !/^[a-z0-9][a-z0-9-]{1,47}$/.test(namespace) || !/^[a-z0-9][a-z0-9-]{1,47}$/.test(slug)) return null;
  const scope = await addressedScope(db, namespace, slug);
  if (!scope) return null;
  return db.tx(async q => {
    if (!await canAccessLoop(q, p, scope.orgId, scope.loopId, 'post')) return null;
    const group = await named(q, scope);
    return group && { scope, ...group };
  });
}

/** The group a poll is for, and how many of its answers came from outside it. Null for a poll made on its own, or a viewer who cannot read the group. */
export async function pollGroup(db: Db, p: Principal | null, pollId: string): Promise<(PollGroup & { guests: number }) | null> {
  if (!p) return null;
  try {
    return await db.tx(async q => {
      const { rows: [scope] } = await q.query<Scope>('select org_id as "orgId",loop_id as "loopId" from when_poll_group where poll_id=$1', [pollId]);
      if (!scope || !await canAccessLoop(q, p, scope.orgId, scope.loopId, 'read')) return null;
      const group = await named(q, scope);
      if (!group) return null;
      const { rows: [{ guests }] } = await q.query<{ guests: number }>(`select count(*)::int as guests from when_answer a where a.poll_id=$1 and not a.draft
        and not exists(select 1 from emba_role r where r.org_id=$2 and r.loop_id=$3 and r.person_id=a.person_id and ${ACTIVE})`, [pollId, scope.orgId, scope.loopId]);
      return { scope, ...group, guests };
    });
  } catch (error) { if (absent(error)) return null; throw error; }
}

/** A group's polls for its page: the open ones, and the ones whose time is set and not yet half a day past. The newest first. */
export async function groupPolls(db: Db, p: Principal, scope: Scope): Promise<GroupPoll[]> {
  try {
    return await db.tx(async q => {
      if (!await canAccessLoop(q, p, scope.orgId, scope.loopId, 'read')) return [];
      return (await q.query<GroupPoll>(`select w.id,w.title,w.status,${iso('w.deadline')} as deadline,${iso('w.chosen_slot')} as "chosenSlot",w.duration_min as "durationMin",w.timezone,o.name as "organizerName",
        n.answered,greatest(w.expected_size,n.answered) as size,exists(select 1 from when_answer a where a.poll_id=w.id and a.person_id=$3 and not a.draft) as mine,
        w.organizer_id=$3 as "isOrganizer",w.ready_at is not null as ready
        from when_poll_group g join when_poll w on w.id=g.poll_id join person o on o.id=w.organizer_id, lateral (select count(*)::int as answered from when_answer a where a.poll_id=w.id and not a.draft) n
        where g.org_id=$1 and g.loop_id=$2 and ((w.status='open' and w.deadline>clock_timestamp()-interval '7 days')
          or (w.status='sent' and w.chosen_slot+make_interval(mins=>w.duration_min)>clock_timestamp()-interval '12 hours'))
        order by w.created_at desc,w.id limit 20`, [scope.orgId, scope.loopId, p.personId])).rows;
    });
  } catch (error) { if (absent(error)) return []; throw error; }
}

/** A poll's group as a line of "Your polls" names it. */
export type PollTag = { ref: string; name: string; href: string; loopId: string };
/**
 * The group of each poll in a list, for "Your polls": the poll's id to its group, or to null for a poll made on its own.
 * A poll whose group the viewer cannot read is left out, so a line never names a group the viewer is not in.
 */
export async function groupsOfPolls(db: Db, p: Principal, pollIds: readonly string[]): Promise<Map<string, PollTag | null>> {
  if (!pollIds.length) return new Map();
  try {
    return await db.tx(async q => {
      const { rows } = await q.query<Scope & { pollId: string }>('select poll_id as "pollId",org_id as "orgId",loop_id as "loopId" from when_poll_group where poll_id=any($1)', [pollIds]);
      const tags = new Map<string, PollTag | null>(pollIds.map(id => [id, null]));
      const seen = new Map<string, PollTag | undefined>();
      for (const row of rows) {
        const key = `${row.orgId}/${row.loopId}`;
        if (!seen.has(key)) {
          const group = await canAccessLoop(q, p, row.orgId, row.loopId, 'read') ? await named(q, row) : null;
          seen.set(key, group ? { ref: group.ref, name: group.name, href: group.href, loopId: row.loopId } : undefined);
        }
        const tag = seen.get(key);
        if (tag) tags.set(row.pollId, tag); else tags.delete(row.pollId);
      }
      return tags;
    });
  } catch (error) { if (absent(error)) return new Map(pollIds.map(id => [id, null])); throw error; }
}
