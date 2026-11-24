import 'server-only';
import type { Q } from '../db';

/**
 * The people a person knows (design D6), each with how: they share a group in the groups data, or they have checked in
 * on an outing together. It decides three things only: whose face and first name a person sees, which outing "I'm in"
 * joins, and who is suggested in "Invite people".
 */
export async function knownTo(q: Q, personId: string): Promise<Map<string, string>> {
  const known = new Map<string, string>();
  const { rows: out } = await q.query<{ id: string }>(`select distinct b.person_id as id from campus_outing_member a
    join campus_outing_member b on b.outing_id=a.outing_id and b.person_id<>a.person_id and b.checked_in_at is not null
    where a.person_id=$1 and a.checked_in_at is not null`, [personId]);
  for (const row of out) known.set(row.id, 'Went out with you');
  // The group says more than "went out", so it wins where both are true.
  const { rows: groups } = await q.query<{ id: string; name: string }>(`select m2.person_id as id,min(o.name) as name from emba_membership m1
    join emba_membership m2 on m2.org_id=m1.org_id and m2.person_id<>m1.person_id and m2.revoked_at is null
    join emba_organization o on o.id=m1.org_id
    where m1.person_id=$1 and m1.revoked_at is null group by m2.person_id`, [personId]);
  for (const row of groups) known.set(row.id, `In ${row.name}`);
  return known;
}

/**
 * How many times a person has been out with each other person: the outings both checked in on (openspec
 * campus-going-together). It only orders things; it is never shown.
 */
export async function timesOut(q: Q, personId: string): Promise<Map<string, number>> {
  const { rows } = await q.query<{ id: string; times: number }>(`select b.person_id as id,count(distinct a.outing_id)::int as times from campus_outing_member a
    join campus_outing_member b on b.outing_id=a.outing_id and b.person_id<>a.person_id and b.checked_in_at is not null
    where a.person_id=$1 and a.checked_in_at is not null group by b.person_id`, [personId]);
  return new Map(rows.map(row => [row.id, row.times]));
}
