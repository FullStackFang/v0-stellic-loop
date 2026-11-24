import 'server-only';
import type { Q } from '../db';
import { CampusError } from './errors';
import { dealsReady, type Campus } from './listings';
import { localParts, zoned } from './time';
import { goodFor } from './words';

// Deals the admin enters once (openspec campus-deals). A deal is a schedule: on each weekday it runs, the first read of
// the campus page makes that day's activity, an ordinary hand listing at the deal's place and hours, with a group reward
// carrying the deal's line and size (design D1, D2). Everything after "I'm in" is the existing path. The note is the
// admin's alone: nothing here that a student's page reads carries it.

export type Deal = {
  id: string; placeId: string; place: string; title: string; line: string; headCount: number;
  /** Weekdays it runs, Sunday = 0. */
  days: number[];
  /** Wall-clock hours on the campus's clock, 'HH:MM'. */
  from: string; until: string;
  note: string | null; hidden: boolean;
};
export type DealInput = { campusId: string; id?: string; placeId: string; title: string; line: string; headCount: number; days: number[]; from: string; until: string; note?: string | null };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clock = (typed: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(typed.trim()) ? typed.trim() : null;

/** A campus's deals, for the admin page: the note included. Hidden ones too. */
export async function campusDeals(q: Q, campusId: string): Promise<Deal[]> {
  if (!(await dealsReady(q))) return [];
  return (await q.query<Deal>(`select d.id,d.place_id as "placeId",p.name as place,d.title,d.line,d.head_count as "headCount",d.days::int[] as days,
      to_char(d.starts_local,'HH24:MI') as "from",to_char(d.ends_local,'HH24:MI') as until,d.note,d.hidden_at is not null as hidden
    from campus_deal d join campus_place p on p.id=d.place_id where d.campus_id=$1 order by d.hidden_at is not null,lower(d.title),d.id`, [campusId])).rows;
}

/**
 * Adds a deal, or changes the one with `id`. A change reaches the days not yet made, and today's activity's title and
 * line while nobody has used its reward. Its hours and size reach it from the next day (design D5).
 */
export async function saveDeal(q: Q, input: DealInput, now: Date = new Date()): Promise<{ id: string }> {
  const title = input.title.trim(), line = input.line.trim(), note = input.note?.trim() || null;
  const days = [...new Set(input.days)].filter(day => Number.isInteger(day) && day >= 0 && day <= 6).sort();
  const from = clock(input.from), until = clock(input.until);
  if (!title) throw new CampusError('Give the activity a name.');
  if (!line) throw new CampusError('Say what the deal is, as students see it.');
  if (!Number.isInteger(input.headCount) || input.headCount < 2 || input.headCount > 4) throw new CampusError('A deal is for a group of 2, 3 or 4.');
  if (!days.length) throw new CampusError('Pick at least one day.');
  if (!from || !until) throw new CampusError('Give the from and until times.');
  if (until <= from) throw new CampusError('The until time must be after the from time.');
  if (!UUID.test(input.placeId) || !(await q.query('select 1 from campus_place where id=$1 and campus_id=$2', [input.placeId, input.campusId])).rows.length) throw new CampusError('Pick a place on this campus.');
  const values = [input.campusId, input.placeId, title, line, input.headCount, days, from, until, note];
  const { rows: [row] } = input.id
    ? await q.query<{ id: string }>(`update campus_deal set place_id=$2,title=$3,line=$4,head_count=$5,days=$6::smallint[],starts_local=$7::time,ends_local=$8::time,note=$9
        where campus_id=$1 and id=$10 returning id`, [...values, input.id])
    : await q.query<{ id: string }>(`insert into campus_deal(campus_id,place_id,title,line,head_count,days,starts_local,ends_local,note)
        values($1,$2,$3,$4,$5,$6::smallint[],$7::time,$8::time,$9) returning id`, values);
  if (!row) throw new CampusError('No such deal.');
  if (input.id) {
    const open = `select l.id from campus_listing l where l.deal_id=$1 and l.ends_at>$2::timestamptz
      and not exists(select 1 from campus_reward r join campus_reward_use u on u.reward_id=r.id where r.listing_id=l.id)`;
    await q.query(`update campus_listing set title=$3,words=$4 where id in (${open})`, [row.id, now.toISOString(), title, goodFor(title, null, null)]);
    await q.query(`update campus_reward set text_member=$3 where listing_id in (${open})`, [row.id, now.toISOString(), line]);
  }
  return row;
}

/** Hides a deal, or shows it again. Today's activity goes with it at once, and comes back with it (design D5). */
export async function setDealHidden(q: Q, campusId: string, dealId: string, hidden: boolean, now: Date = new Date()) {
  if (!UUID.test(dealId)) throw new CampusError('No such deal.');
  const { rows } = await q.query('update campus_deal set hidden_at=case when $3 then coalesce(hidden_at,now()) end where id=$1 and campus_id=$2 returning id', [dealId, campusId, hidden]);
  if (!rows.length) throw new CampusError('No such deal.');
  await q.query('update campus_listing set hidden_at=case when $3 then coalesce(hidden_at,now()) end where deal_id=$1 and ends_at>$2::timestamptz', [dealId, now.toISOString(), hidden]);
}
export const hideDeal = (q: Q, campusId: string, dealId: string, now?: Date) => setDealHidden(q, campusId, dealId, true, now);

/**
 * Makes today's activity for each live deal that runs today on the campus's clock, once (design D2). A day already
 * made, even one since hidden or made at other hours, is left as it is. Returns false, having done nothing, on a
 * database the deals migration has not reached.
 */
export async function ensureDealDays(q: Q, campus: Pick<Campus, 'id' | 'tz'>, now: Date = new Date()): Promise<boolean> {
  if (!(await dealsReady(q))) return false;
  const { date, weekday } = localParts(campus.tz, now), day = WEEKDAYS.indexOf(weekday);
  const { rows } = await q.query<{ id: string; title: string; place: string; from: string; until: string }>(`select d.id,d.title,p.name as place,to_char(d.starts_local,'HH24:MI') as "from",to_char(d.ends_local,'HH24:MI') as until
    from campus_deal d join campus_place p on p.id=d.place_id
    where d.campus_id=$1 and d.hidden_at is null and $2::smallint=any(d.days)
      and not exists(select 1 from campus_listing l where l.deal_id=d.id and (l.starts_at at time zone $3)::date=$4::date)`, [campus.id, day, campus.tz, date]);
  for (const deal of rows) {
    // One statement, so a day is never made without its reward. A second read at the same moment makes nothing.
    await q.query(`with made as (
        insert into campus_listing(campus_id,origin,title,host_name,place_id,starts_at,ends_at,words,deal_id)
        values($1,'hand',$2,$3,(select place_id from campus_deal where id=$4),$5,$6,$7,$4)
        on conflict (deal_id,starts_at) where deal_id is not null do nothing returning id)
      insert into campus_reward(campus_id,giver,kind,text_member,listing_id,head_count)
      select $1,$3,'group',d.line,made.id,d.head_count from made, campus_deal d where d.id=$4`,
      [campus.id, deal.title, deal.place, deal.id, zoned(campus.tz, `${date}T${deal.from}`).toISOString(), zoned(campus.tz, `${date}T${deal.until}`).toISOString(), goodFor(deal.title, null, deal.place)]);
  }
  return true;
}

/** The rewards made for deals' days, which the admin's Rewards list leaves out: the Deals tab is where they are run. */
export async function dealRewardIds(q: Q, campusId: string): Promise<Set<string>> {
  if (!(await dealsReady(q))) return new Set();
  const { rows } = await q.query<{ id: string }>('select r.id from campus_reward r join campus_listing l on l.id=r.listing_id where r.campus_id=$1 and l.deal_id is not null', [campusId]);
  return new Set(rows.map(row => row.id));
}
