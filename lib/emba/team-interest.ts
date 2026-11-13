import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import type {Principal} from './access';
import {EmbaError} from './errors';
import {byName,local,posts,reading,scope,stop,teamWrite,viewMembers,type Listed,type Member,type Refused,type Scope,type TeamHead} from './team-core';
import {bare,EVENTS,upcoming,viewEvents,type EventView} from './team-events';
import {nameSchema} from './team-text';

// Interest in an event (design D2): one switch per member per event. Members
// and followers of the team see who is interested. Someone outside the team
// sees the event's facts through its share link, and a count only at five or more.

/** How a mark or an answer arrived. An assistant's route is set from its sign-in, never from input. */
export const route=z.enum(['site','share_link']).default('site');
export const arrival=(p:Principal,stated:'site'|'share_link')=>p.clientId===null?{route:stated,clientId:null}:{route:'assistant' as const,clientId:p.clientId};

export type InterestWrite=
 |{saved:true;interested:boolean;changed:boolean;event:EventView}
 |Refused
 |{saved:false;reason:'unknown_event';value:string};
type Declined=Exclude<InterestWrite,{saved:true}|Refused>;
const interestSchema=z.strictObject({...scope,event:nameSchema,interested:z.boolean().default(true),route});
/** Marks the caller interested in an event, or takes the mark back. Only ever the caller's own. */
export async function setInterest(db:Db,p:Principal,input:unknown):Promise<InterestWrite> {
 const data=interestSchema.parse(input);
 return teamWrite<Exclude<InterestWrite,Refused>>(db,p,data,{need:'post',count:true},async ctx=>{
  const {rows:[event]}=await ctx.q.query<{id:string}>('select id from emba_team_event where org_id=$1 and loop_id=$2 and slug=$3 and archived_at is null for share',[data.orgId,data.loopId,data.event]);
  if(!event)return stop<Declined>({saved:false,reason:'unknown_event',value:data.event});
  const how=arrival(p,data.route);
  const {rows}=data.interested
   ?await ctx.q.query('insert into emba_event_interest(event_id,org_id,loop_id,person_id,route,client_id) values($1,$2,$3,$4,$5,$6) on conflict do nothing returning person_id',[event.id,data.orgId,data.loopId,p.personId,how.route,how.clientId])
   :await ctx.q.query('delete from emba_event_interest where event_id=$1 and person_id=$2 returning person_id',[event.id,p.personId]);
  return {saved:true,interested:data.interested,changed:rows.length>0,event:bare((await viewEvents(ctx.q,ctx.p,ctx.timezone,[event.id]))[0])};
 });
}

export type EventWithPeople=EventView&{people:Member[];morePeople:number};
export type Upcoming={team:TeamHead;timezone:string;today:string;events:Listed<EventView|EventWithPeople>;untrusted:true};
const PEOPLE=100;
/** Who is interested, per event: current members only, by handle to an assistant and also by name on the site. No order of arrival. */
async function interested(q:Q,p:Principal,team:Scope,eventIds:string[]):Promise<(eventId:string)=>{people:Member[];morePeople:number}> {
 const {rows}=eventIds.length?await q.query<{eventId:string;personId:string}>(`select i.event_id as "eventId",i.person_id as "personId" from emba_event_interest i
  where i.event_id=any($3::uuid[]) and ${posts('i.person_id')}`,[team.orgId,team.loopId,eventIds]):{rows:[]};
 const person=await viewMembers(q,p,team,rows.map(row=>row.personId));
 return eventId=>{
  const people=rows.filter(row=>row.eventId===eventId).map(row=>person(row.personId)).sort(byName);
  return {people:people.slice(0,PEOPLE),morePeople:Math.max(0,people.length-PEOPLE)};
 };
}
/** A team's events that have not ended: soonest first, undated last, at most 30, each with its count and whether the caller is interested. */
export async function upcomingEvents(db:Db,p:Principal,input:unknown):Promise<Upcoming> {
 const {people,...team}=z.strictObject({...scope,people:z.boolean().default(false)}).parse(input);
 return reading(db,p,team,async({q,...base})=>{
  const {rows}=await q.query<{id:string;total:number}>(`select e.id,count(*) over()::int as total from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and ${upcoming}
   order by e.starts_at asc nulls last,e.slug limit ${EVENTS.list}`,[team.orgId,team.loopId]);
  const events=await viewEvents(q,p,base.timezone,rows.map(row=>row.id)),who=people?await interested(q,p,team,events.map(event=>event.id)):null;
  return {team:base.team,timezone:base.timezone,today:base.today,events:{items:events.map(event=>who?{...bare(event),...who(event.id)}:bare(event)),more:Math.max(0,(rows[0]?.total??0)-rows.length)},untrusted:true as const};
 });
}
export type EventDetail={team:TeamHead;timezone:string;today:string;event:EventWithPeople;untrusted:true};
/** One event with who is interested. An archived or unknown event is not found. */
export async function eventDetail(db:Db,p:Principal,input:unknown):Promise<EventDetail> {
 const {event,...team}=z.strictObject({...scope,event:nameSchema}).parse(input);
 return reading(db,p,team,async({q,...base})=>{
  const {rows:[found]}=await q.query<{id:string}>('select id from emba_team_event where org_id=$1 and loop_id=$2 and slug=$3 and archived_at is null',[team.orgId,team.loopId,event]);
  if(!found)throw new EmbaError('not_found');
  const [view]=await viewEvents(q,p,base.timezone,[found.id]),who=await interested(q,p,team,[found.id]);
  return {team:base.team,timezone:base.timezone,today:base.today,event:{...bare(view),...who(found.id)},untrusted:true as const};
 });
}

/** What someone outside the team may see of an event: its name, time and place, and a count of interested members only at five or more. Never a name. */
export type EventOutside={group:string;name:string;startsAt:string;endsAt:string|null;starts:string;ends:string|null;timezone:string;place:string|null;interested:number|null};
/** How a group lets a signed-in person in from a share link: null when its join link is off. */
export type JoinStep={mode:'ask_first'|'admit';requested:boolean}|null;
export type EventShare=
 |{view:'member';namespace:string;scope:Scope;detail:EventDetail;outside:EventOutside}
 |{view:'outside';outside:EventOutside;signedIn:boolean;join:JoinStep};
const token=z.string().regex(/^[0-9a-f]{32}$/);
/**
 * The page behind an event's share link. The token names a dated event and
 * grants nothing: a member of the team gets the member view, and anyone else
 * (signed out, or signed in and not in the team) gets the outside view. The
 * link preview is built from `outside` alone.
 */
export async function eventShare(db:Db,p:Principal|null,input:string):Promise<EventShare> {
 const shareToken=token.parse(input);
 const {rows:[found]}=await db.query<EventOutside&Scope&{slug:string;namespace:string;count:number;mode:'ask_first'|'admit'|null;requested:boolean}>(`select e.org_id as "orgId",e.loop_id as "loopId",e.slug,a.namespace,o.name as "group",e.name,
   e.starts_at as "startsAt",e.ends_at as "endsAt",${local('e.starts_at',"coalesce(s.timezone,'UTC')")} as starts,${local('e.ends_at',"coalesce(s.timezone,'UTC')")} as ends,coalesce(s.timezone,'UTC') as timezone,e.place,
   (select count(*) from emba_event_interest i where i.event_id=e.id and ${posts('i.person_id','e.org_id','e.loop_id')})::int as count,
   (select l.join_mode from emba_group_request_link l where l.org_id=e.org_id and l.loop_id=e.loop_id and l.disabled_at is null) as mode,
   exists(select 1 from emba_group_membership_request r where r.org_id=e.org_id and r.loop_id=e.loop_id and r.person_id=$2::uuid and r.state='pending') as requested
  from emba_team_event e join emba_group_address a on a.org_id=e.org_id and a.loop_id=e.loop_id and a.retired_at is null join emba_organization o on o.id=e.org_id
   left join emba_team_state s on s.org_id=e.org_id and s.loop_id=e.loop_id
  where e.share_token=$1 and e.archived_at is null and e.starts_at is not null`,[shareToken,p?.personId??null]);
 if(!found)throw new EmbaError('not_found');
 const {orgId,loopId,slug,namespace,count,mode,requested,...facts}=found;
 const outside:EventOutside={...facts,interested:count>=EVENTS.floor?count:null};
 // Only a person on the site is ever shown the member view; an assistant has its own tools.
 if(p&&p.clientId===null){
  try{return {view:'member',namespace,scope:{orgId,loopId},detail:await eventDetail(db,p,{orgId,loopId,event:slug}),outside};}
  catch(error){if(!(error instanceof EmbaError)||(error.code!=='forbidden'&&error.code!=='not_found'))throw error;}
 }
 return {view:'outside',outside,signedIn:Boolean(p),join:mode?{mode,requested}:null};
}
