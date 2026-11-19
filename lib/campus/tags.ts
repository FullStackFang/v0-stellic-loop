import 'server-only';
import type { Q } from '../db';
import { CampusError } from './errors';
import { TAG } from './line';
import { firstNames } from './people';
import { tagRow } from './words';

// Tags (openspec loop-campus-tags): an @ is anything people gather around. A place ("collegetown"), an activity
// ("jogging"), an event ("slope-day"). Nobody curates them: one exists from the first plan posted with it. Each has a
// kind nobody is asked for, and tags that mean the same thing point at one lead tag (`same_as`), one level deep. What
// a person typed is kept on their plan; counting and suggesting go through the lead.

export const KINDS = ['place', 'activity', 'event', 'other'] as const;
export type Kind = typeof KINDS[number];

export type NearTag = {
  /** The lead of the group: the word most people use for it. */
  slug: string;
  /** How many people are in plans with any tag of the group, from a week back onward. A count only: nobody is named by it. */
  people: number;
  /** First names of up to two of them the viewer knows. */
  known: string[];
  /** The other tags of the group, so that typing "@jog" finds "@running". */
  also: string[];
};

/** The stored form of a typed tag, or a refusal. */
export function tagSlug(typed: string): string {
  const slug = typed.trim().replace(/^@/, '').toLowerCase();
  if (!TAG.test(slug)) throw new CampusError('A tag is letters, numbers and dashes, 2 to 30 long.');
  return slug;
}

/** The tag's id, made now if this is its first use. */
export async function tagFor(q: Q, campusId: string, slug: string, personId: string): Promise<string> {
  await q.query('insert into campus_tag(campus_id,slug,created_by) values($1,$2,$3) on conflict(campus_id,slug) do nothing', [campusId, slug, personId]);
  return (await q.query<{ id: string }>('select id from campus_tag where campus_id=$1 and slug=$2', [campusId, slug])).rows[0].id;
}

/** Puts tags on a plan in the order given, sorts each, and sets the plan's place. Posting calls this; nothing here waits on anything outside. */
export async function tagListing(q: Q, campusId: string, listingId: string, slugs: string[], personId: string): Promise<void> {
  const ids: string[] = [];
  for (const [position, slug] of slugs.entries()) {
    ids.push(await tagFor(q, campusId, slug, personId));
    await q.query('insert into campus_listing_tag(listing_id,tag_id,position) values($1,$2,$3)', [listingId, ids[position], position]);
  }
  for (const id of [...ids]) ids.push(...await sortTag(q, id));
  await setPlaces(q, ids);
}

/** A plan's place is its first tag of kind place. Set again on every plan that carries one of these tags. */
async function setPlaces(q: Q, tagIds: string[]): Promise<void> {
  await q.query(`update campus_listing l set tag_id=(select lt.tag_id from campus_listing_tag lt join campus_tag t on t.id=lt.tag_id where lt.listing_id=l.id and t.kind='place' order by lt.position limit 1)
    where l.id in(select listing_id from campus_listing_tag where tag_id=any($1::uuid[]))`, [tagIds]);
}

const PEOPLE = `(select count(distinct m.person_id) from campus_listing_tag lt join campus_listing l on l.id=lt.listing_id and l.cancelled_at is null and l.hidden_at is null
  join campus_outing_member m on m.listing_id=l.id where lt.tag_id=t.id)`;
/** Every tag in the group this tag is in, itself included. */
async function groupOf(q: Q, tagId: string): Promise<string[]> {
  return (await q.query<{ id: string }>('select g.id from campus_tag t join campus_tag g on coalesce(g.same_as,g.id)=coalesce(t.same_as,t.id) where t.id=$1', [tagId])).rows.map(row => row.id);
}
/** Makes these tags one group. Its lead is the tag the most people are in plans with; on a tie, the lead it had, then the oldest. */
async function regroup(q: Q, ids: string[]): Promise<void> {
  const { rows: [lead] } = await q.query<{ id: string }>(`select t.id from campus_tag t where t.id=any($1::uuid[]) order by ${PEOPLE} desc,(t.same_as is null) desc,t.created_at,t.slug limit 1`, [ids]);
  if (lead) await q.query('update campus_tag set same_as=case when id=$2 then null else $2::uuid end where id=any($1::uuid[]) and same_as is distinct from case when id=$2 then null else $2::uuid end', [ids, lead.id]);
}

/**
 * Sorts a tag by the word table alone (design D4, layer 1). A word the table knows is something to do, and joins the
 * tags the table says mean the same. Any other tag joins a tag that differs only by a dash or a plural, and takes its
 * kind. A tag already sorted, already in a group, or set by the admin is left as it is. Then the group's lead is
 * picked again, since this plan may have changed which word is used most. Returns the tags whose kind changed.
 */
export async function sortTag(q: Q, tagId: string): Promise<string[]> {
  const { rows: [tag] } = await q.query<{ campusId: string; slug: string; open: boolean }>('select campus_id as "campusId",slug,(sorted_at is null and same_as is null and not by_hand) as open from campus_tag where id=$1', [tagId]);
  if (!tag) return [];
  let changed: string[] = [];
  if (tag.open) {
    const mine = tagRow(tag.slug);
    const { rows: others } = await q.query<{ id: string; slug: string; kind: Kind | null; sameAs: string | null }>('select id,slug,kind,same_as as "sameAs" from campus_tag where campus_id=$1 and id<>$2 order by created_at,slug', [tag.campusId, tagId]);
    // Only tags of one kind are grouped: a word that is something to do never joins a place spelled like it.
    const match = others.find(other => (other.sameAs ?? other.id) !== tagId && tagRow(other.slug).key === mine.key && (!mine.activity || other.kind === 'activity'));
    const kind = mine.activity ? 'activity' : match?.kind ?? null;
    if (kind) changed = (await q.query<{ id: string }>('update campus_tag set kind=$2,sorted_at=now() where id=$1 or same_as=$1 returning id', [tagId, kind])).rows.map(row => row.id);
    if (match) await q.query('update campus_tag set same_as=$2 where id=$1 or same_as=$1', [tagId, match.sameAs ?? match.id]);
  }
  await regroup(q, await groupOf(q, tagId));
  return changed;
}

/** A campus's tags that people are using, by group, the busiest first. `known` is who the viewer knows (lib/campus/knows.ts). */
export async function nearTags(q: Q, campusId: string, known: ReadonlyMap<string, string>, now: Date = new Date()): Promise<NearTag[]> {
  const { rows } = await q.query<{ slug: string; people: string[]; also: string[] }>(`select g.slug,array_agg(distinct m.person_id) as people,
      coalesce((select array_agg(x.slug order by x.slug) from campus_tag x where x.same_as=g.id),'{}') as also
    from campus_tag t join campus_tag g on g.id=coalesce(t.same_as,t.id) join campus_listing_tag lt on lt.tag_id=t.id
    join campus_listing l on l.id=lt.listing_id and l.cancelled_at is null and l.hidden_at is null and l.starts_at>$2::timestamptz-interval '7 days'
    join campus_outing_member m on m.listing_id=l.id
    where t.campus_id=$1 group by g.id,g.slug order by count(distinct m.person_id) desc,g.slug limit 60`, [campusId, now.toISOString()]);
  const names = await firstNames(q, [...new Set(rows.flatMap(row => row.people.filter(id => known.has(id))))]);
  return rows.map(row => ({ slug: row.slug, people: row.people.length, known: row.people.filter(id => names.has(id)).map(id => names.get(id)!.first).sort().slice(0, 2), also: row.also }));
}

// What the admin does by hand (design D6). Like lib/campus/manage.ts, these do not check who is asking: the admin page's
// actions do. Each marks what it touched `by_hand`, which the automatic sorting never touches again.

export type AdminTag = {
  id: string; slug: string; kind: Kind | null; byHand: boolean;
  /** The lead of the group it is in; null for a lead and for a tag on its own. */
  lead: string | null;
  /** People in plans with it, ever. For a lead, with any tag of its group. */
  people: number;
};
/** Every tag of a campus, group by group, the busiest group first: the lead, then the tags that point at it. */
export async function campusTags(q: Q, campusId: string): Promise<AdminTag[]> {
  return (await q.query<AdminTag>(`with own as (select lt.tag_id,m.person_id from campus_listing_tag lt join campus_listing l on l.id=lt.listing_id and l.cancelled_at is null and l.hidden_at is null join campus_outing_member m on m.listing_id=l.id),
      grp as (select coalesce(t.same_as,t.id) as id,count(distinct o.person_id)::int as people from campus_tag t left join own o on o.tag_id=t.id where t.campus_id=$1 group by 1)
    select t.id,t.slug,t.kind,t.by_hand as "byHand",g.slug as lead,case when t.same_as is null then grp.people else (select count(distinct o.person_id)::int from own o where o.tag_id=t.id) end as people
    from campus_tag t left join campus_tag g on g.id=t.same_as join grp on grp.id=coalesce(t.same_as,t.id)
    where t.campus_id=$1 order by grp.people desc,coalesce(g.slug,t.slug),t.same_as is not null,t.slug`, [campusId])).rows;
}

async function find(q: Q, campusId: string, tagId: string) {
  const { rows: [tag] } = await q.query<{ id: string; slug: string; kind: Kind | null; root: string }>('select id,slug,kind,coalesce(same_as,id) as root from campus_tag where id=$1 and campus_id=$2', [tagId, campusId]);
  if (!tag) throw new Error('No such tag');
  return tag;
}
const HAND = 'by_hand=true,sorted_at=coalesce(sorted_at,now())';

/** Changes a tag's kind. A group has one kind, so the whole group it is in changes with it. */
export async function setTagKind(q: Q, campusId: string, tagId: string, kind: string): Promise<void> {
  if (!KINDS.some(each => each === kind)) throw new Error('A tag is a place, an activity, an event or other');
  const tag = await find(q, campusId, tagId);
  const { rows } = await q.query<{ id: string }>(`update campus_tag set kind=$2,${HAND} where id=$1 or same_as=$1 returning id`, [tag.root, kind]);
  await setPlaces(q, rows.map(row => row.id));
}

/** Joins a tag, and any tags that point at it, to the group another tag is in. It takes that group's kind. */
export async function joinTag(q: Q, campusId: string, tagId: string, intoId: string): Promise<void> {
  const tag = await find(q, campusId, tagId), into = await find(q, campusId, intoId);
  if (tag.root === into.root) throw new Error(`@${tag.slug} is already with @${into.slug}`);
  const { rows } = await q.query<{ id: string }>('update campus_tag set same_as=$2,kind=$3 where id=$1 or same_as=$1 returning id', [tag.id, into.root, into.kind]);
  await q.query(`update campus_tag set ${HAND} where id=$1`, [tag.id]);
  await regroup(q, await groupOf(q, into.root));
  await setPlaces(q, rows.map(row => row.id));
}

/** Takes a tag out of its group, to stand on its own. Split out of the lead's place, the rest stay together. */
export async function splitTag(q: Q, campusId: string, tagId: string): Promise<void> {
  const tag = await find(q, campusId, tagId), rest = (await groupOf(q, tag.id)).filter(id => id !== tag.id);
  await q.query(`update campus_tag set same_as=null,${HAND} where id=$1`, [tag.id]);
  if (rest.length) await regroup(q, rest);
}
