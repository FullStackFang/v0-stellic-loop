import 'server-only';
import {z} from 'zod';
import type {Db} from '../db';
import {canAccessLoop,type Principal} from './access';
import {requireFirstParty} from './consent';
import {EmbaError} from './errors';
import {local,posts,reading,scope} from './team-core';
import {upcoming} from './team-events';

// The organizer view (design of loop-club-reach, spec organizer-view). Counts
// only: how many members are interested in each upcoming event, day by day.
// It holds no row per member and no measure of anyone's activity. Open asks
// with "answered of expected" come from listAsks, which already counts
// without naming anyone.

export const ORGANIZE={
 /** How many days back the count is shown. */
 days:14} as const;
export type InterestDays={slug:string;name:string;starts:string|null;
 /** Members interested now. */
 interested:number;
 /**
  * The count on each day since the event was added, oldest first, in the
  * team's timezone. A day's count is of marks still standing that were made
  * by that day: a mark later taken back is in no day.
  */
 days:{day:string;count:number}[]};

/** Site only, owners and organizers only: interest in each upcoming event by day. */
export async function interestByDay(db:Db,p:Principal,input:unknown):Promise<{timezone:string;events:InterestDays[]}> {
 const team=z.strictObject(scope).parse(input);
 return reading(db,p,team,async({q,timezone})=>{
  await requireFirstParty(q,p);
  if(!await canAccessLoop(q,p,team.orgId,team.loopId,'manage'))throw new EmbaError('forbidden');
  const today='(clock_timestamp() at time zone $3)::date';
  const {rows}=await q.query<{slug:string;name:string;starts:string|null;day:string;count:number}>(`select e.slug,e.name,${local('e.starts_at','$3::text')} as starts,to_char(d.day,'YYYY-MM-DD') as day,
    (select count(*)::int from emba_event_interest i where i.event_id=e.id and ${posts('i.person_id')} and (i.at at time zone $3)::date<=d.day::date) as count
   from emba_team_event e cross join lateral generate_series(greatest((e.created_at at time zone $3)::date,${today}-${ORGANIZE.days-1})::timestamp,${today}::timestamp,interval '1 day') as d(day)
   where e.org_id=$1 and e.loop_id=$2 and ${upcoming} order by e.starts_at asc nulls last,e.slug,d.day`,[team.orgId,team.loopId,timezone]);
  const events=new Map<string,InterestDays>();
  for(const row of rows){
   const event=events.get(row.slug)??{slug:row.slug,name:row.name,starts:row.starts,interested:0,days:[]};
   event.days.push({day:row.day,count:row.count});event.interested=row.count;
   events.set(row.slug,event);
  }
  return {timezone,events:[...events.values()]};
 });
}
