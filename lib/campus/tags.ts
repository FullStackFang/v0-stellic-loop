import 'server-only';
import type { Q } from '../db';
import { CampusError } from './errors';
import { TAG } from './line';
import { firstNames } from './people';

// @places (openspec loop-group-event-links, design D12): a name people give a spot, such as "collegetown" or
// "donlon-2f". Nobody curates them. One exists from the first plan posted with it, and is suggested for as long as
// people are in plans there.

export type NearTag = {
  slug: string;
  /** How many people are in plans there, from a week back onward. A count only: nobody is named by it. */
  people: number;
  /** First names of up to two of them the viewer knows. */
  known: string[];
};

/** The stored form of a typed @place, or a refusal. */
export function tagSlug(typed: string): string {
  const slug = typed.trim().replace(/^@/, '').toLowerCase();
  if (!TAG.test(slug)) throw new CampusError('An @place is letters, numbers and dashes, 2 to 30 long.');
  return slug;
}

/** The @place's id, made now if this is its first use. */
export async function tagFor(q: Q, campusId: string, slug: string, personId: string): Promise<string> {
  await q.query('insert into campus_tag(campus_id,slug,created_by) values($1,$2,$3) on conflict(campus_id,slug) do nothing', [campusId, slug, personId]);
  return (await q.query<{ id: string }>('select id from campus_tag where campus_id=$1 and slug=$2', [campusId, slug])).rows[0].id;
}

/** A campus's @places that people are using, the busiest first. `known` is who the viewer knows (lib/campus/knows.ts). */
export async function nearTags(q: Q, campusId: string, known: ReadonlyMap<string, string>, now: Date = new Date()): Promise<NearTag[]> {
  const { rows } = await q.query<{ slug: string; people: string[] }>(`select t.slug,array_agg(distinct m.person_id) as people
    from campus_tag t join campus_listing l on l.tag_id=t.id and l.cancelled_at is null and l.hidden_at is null and l.starts_at>$2::timestamptz-interval '7 days'
    join campus_outing_member m on m.listing_id=l.id
    where t.campus_id=$1 group by t.id,t.slug order by count(distinct m.person_id) desc,t.slug limit 60`, [campusId, now.toISOString()]);
  const names = await firstNames(q, [...new Set(rows.flatMap(row => row.people.filter(id => known.has(id))))]);
  return rows.map(row => ({ slug: row.slug, people: row.people.length, known: row.people.filter(id => names.has(id)).map(id => names.get(id)!.first).sort().slice(0, 2) }));
}
