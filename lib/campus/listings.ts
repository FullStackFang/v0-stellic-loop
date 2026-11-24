import 'server-only';
import type { Q } from '../db';

// The one list of events on a campus (design D5): from feeds, from people and from the admin, together.

export type Campus = { id: string; slug: string; name: string; tz: string; domains: string[]; listSource: string };
export type Listing = {
  id: string; origin: 'feed' | 'member' | 'hand';
  /** The feed's source name ("CampusGroups", "Luma"); null for a plan or a hand-entered event. */
  source: string | null;
  title: string; about: string | null; host: string | null; placeText: string | null;
  place: { name: string; lat: number; lon: number } | null;
  startsAt: string; endsAt: string | null; words: string[]; postedBy: string | null;
  /** The event page a posted plan was filled from; null for everything else. */
  link: string | null;
  /** A posted plan's place: its first tag of kind place, without the @ (openspec loop-campus-tags). */
  tag: string | null;
  /** Every tag a posted plan was given, in the order typed, without the @. */
  tags: string[];
  /** How many people are in, over all its outings. */
  going: number;
  /** A plan posted with a day and no time (openspec campus-plan-place-and-time): its times are that whole day. */
  timeOpen: boolean;
  /** When its poster sent the time picked from "When works?"; null otherwise. */
  timeSetAt: string | null;
  /** The deal whose day this is (openspec campus-deals); null for everything else. */
  dealId: string | null;
};

const CAMPUS = 'id,slug,name,tz,domains,list_source as "listSource"';

export async function findCampus(q: Q, slug: string): Promise<Campus | null> {
  return (await q.query<Campus>(`select ${CAMPUS} from campus where slug=$1`, [slug])).rows[0] ?? null;
}
export async function listCampuses(q: Q): Promise<Campus[]> {
  return (await q.query<Campus>(`select ${CAMPUS} from campus order by created_at,name`)).rows;
}

/**
 * Whether the deals migration has been run (openspec campus-deals). Until it has, nothing reads a deal and the list is as
 * it was. Once it has, that is kept: it is asked again only while the answer is no.
 */
let dealsMigrated = false;
export async function dealsReady(q: Q): Promise<boolean> {
  if (!dealsMigrated) dealsMigrated = !!(await q.query<{ ok: boolean }>("select to_regclass('campus_deal') is not null as ok")).rows[0]?.ok;
  return dealsMigrated;
}

type Row = Omit<Listing, 'place'> & { placeName: string | null; lat: number | null; lon: number | null };
const listing = (deals: boolean) => `l.id,l.origin,${deals ? 'l.deal_id' : 'null::uuid'} as "dealId",f.source,l.title,l.about,l.host_name as host,l.place_text as "placeText",p.name as "placeName",p.lat,p.lon,
  l.starts_at as "startsAt",l.ends_at as "endsAt",l.time_open as "timeOpen",l.time_set_at as "timeSetAt",l.words,l.posted_by as "postedBy",l.link,g.slug as tag,
  coalesce((select array_agg(x.slug order by lt.position) from campus_listing_tag lt join campus_tag x on x.id=lt.tag_id where lt.listing_id=l.id),'{}') as tags,
  (select count(*)::int from campus_outing_member m where m.listing_id=l.id) as going
  from campus_listing l left join campus_feed f on f.id=l.feed_id left join campus_place p on p.id=l.place_id left join campus_tag g on g.id=l.tag_id`;
const shape = ({ placeName, lat, lon, ...row }: Row): Listing => ({ ...row, place: placeName !== null && lat !== null && lon !== null ? { name: placeName, lat, lon } : null });

/**
 * A campus's events from now through the end of the seventh day in its timezone, in time order.
 * Hidden and cancelled events, events gone from their feed and events that have ended are left out, and so is a deal's
 * day outside its hours (openspec campus-deals, design D3).
 */
export async function weekListings(q: Q, campus: Pick<Campus, 'id' | 'tz'>, now: Date = new Date()): Promise<Listing[]> {
  const deals = await dealsReady(q);
  const { rows } = await q.query<Row>(`select ${listing(deals)}
    where l.campus_id=$1 and l.hidden_at is null and l.cancelled_at is null and l.left_feed_at is null
      and coalesce(l.ends_at,l.starts_at+interval '2 hours')>$2::timestamptz
      and l.starts_at<((($2::timestamptz at time zone $3)::date+7)::timestamp at time zone $3)
      ${deals ? 'and (l.deal_id is null or (l.starts_at<=$2::timestamptz and l.ends_at>$2::timestamptz))' : ''}
    order by l.starts_at,l.title,l.id`, [campus.id, now.toISOString(), campus.tz]);
  return rows.map(shape);
}

/** One event, whatever its state, for the share link and for the actions that need its times. */
export async function findListing(q: Q, id: string): Promise<(Listing & { campusId: string; live: boolean }) | null> {
  const { rows: [row] } = await q.query<Row & { campusId: string; live: boolean }>(`select ${listing(await dealsReady(q)).replace('l.id,', 'l.id,l.campus_id as "campusId",(l.hidden_at is null and l.cancelled_at is null and l.left_feed_at is null) as live,')} where l.id=$1`, [id]);
  return row ? { ...shape(row), campusId: row.campusId, live: row.live } : null;
}
