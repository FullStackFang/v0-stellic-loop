import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import type {Principal} from './access';
import {EmbaError} from './errors';
import {byName,local,posts,reading,scope,stop,teamWrite,viewMembers,type Listed,type Member,type Refused,type Scope,type TeamHead} from './team-core';
import {cancelOne,inviteOne} from './team-calendar';
import {bare,closeDayAskIfAnswered,EVENTS,IDEAS,lapseDue,openIdea,settled,upcoming,viewEvents,type EventView} from './team-events';
import {settle} from './team-ideas';
import {nameSchema} from './team-text';

// Interest in an event (design D2): one switch per member per event. Members
// and followers of the team see who is interested. Someone outside the team
// sees the event's facts through its share link, and a count only at five or more.

/** How a mark or an answer arrived. An assistant's route is set from its sign-in, never from input. */
export const route=z.enum(['site','share_link']).default('site');
/**
 * Set by the connector, never by the model: the call came from a control on
 * the in-chat card. It changes only the route that is stored.
 */
export const card=z.boolean().default(false);
export const arrival=(p:Principal,stated:'site'|'share_link',fromCard=false)=>p.clientId===null?{route:stated,clientId:null}:{route:fromCard?'assistant_card' as const:'assistant' as const,clientId:p.clientId};

export type InterestWrite=
 |{saved:true;interested:boolean;
  /** The user said the event is not for them: it no longer waits for them. */
  declined:boolean;changed:boolean;event:EventView}
 |Refused
 |{saved:false;reason:'unknown_event';value:string};
type Declined=Exclude<InterestWrite,{saved:true}|Refused>;
const interestSchema=z.strictObject({...scope,event:nameSchema,interested:z.boolean().default(true),decline:z.boolean().default(false),route,card}).refine(data=>!(data.interested&&data.decline));
/**
 * Marks the caller interested in an event, or takes the mark back. With
 * `decline` the caller says the event is not for them: any mark is removed and
 * the event stops waiting for them (design D8b of loop-club-reach). Marking
 * interest later undoes a decline. Only ever the caller's own.
 */
export async function setInterest(db:Db,p:Principal,input:unknown):Promise<InterestWrite> {
 const data=interestSchema.parse(input);
 // A mark on an idea, a plan or an event that was sent as an invite can make a plan or reach a calendar. Those are decided one at a
 // time, under the team's lock. Whether this is such an event is looked up first, because the lock is taken before the event's row.
 const tracked="(state<>'fixed' or invites_at is not null)";
 const {rows:[ahead]}=await db.query<{tracked:boolean}>(`select ${tracked} as tracked from emba_team_event where org_id=$1 and loop_id=$2 and slug=$3 and archived_at is null`,[data.orgId,data.loopId,data.event]);
 const locked=Boolean(ahead?.tracked);
 return teamWrite<Exclude<InterestWrite,Refused>|Extract<Refused,{reason:'busy'}>>(db,p,data,{need:'post',count:true,lock:locked},async ctx=>{
  if(locked)await lapseDue(ctx.q,ctx.team);
  const {rows:[event]}=await ctx.q.query<{id:string;state:string;invited:boolean;askId:string|null;tracked:boolean}>(`select id,state,invites_at is not null as invited,day_ask_id as "askId",${tracked} as tracked from emba_team_event where org_id=$1 and loop_id=$2 and slug=$3 and archived_at is null for share`,[data.orgId,data.loopId,data.event]);
  if(!event)return stop<Declined>({saved:false,reason:'unknown_event',value:data.event});
  // It became one of those a moment ago: nothing is saved, and the next try takes the lock.
  if(event.tracked&&!locked)stop<Refused>({saved:false,reason:'busy'});
  const how=arrival(p,data.route,data.card);
  const {rows:marked}=data.interested
   ?await ctx.q.query('insert into emba_event_interest(event_id,org_id,loop_id,person_id,route,client_id) values($1,$2,$3,$4,$5,$6) on conflict do nothing returning person_id',[event.id,data.orgId,data.loopId,p.personId,how.route,how.clientId])
   :await ctx.q.query('delete from emba_event_interest where event_id=$1 and person_id=$2 returning person_id',[event.id,p.personId]);
  // Nobody else learns of a decline: it is the caller's own note that the event need not be offered to them again.
  const {rows:noted}=data.decline
   ?await ctx.q.query('insert into emba_event_decline(event_id,org_id,loop_id,person_id) values($1,$2,$3,$4) on conflict do nothing returning person_id',[event.id,data.orgId,data.loopId,p.personId])
   :data.interested?await ctx.q.query('delete from emba_event_decline where event_id=$1 and person_id=$2 returning person_id',[event.id,p.personId]):{rows:[]};
  if(marked.length){
   if(event.state==='idea'){
    // One more person can be the last the idea needed. One fewer takes their answer about the day with them.
    if(data.interested)await settle(ctx,event.id);
    else if(event.askId){
     await ctx.q.query('delete from emba_ask_answer a using emba_ask k where k.id=a.ask_id and a.ask_id=$1 and a.person_id=$2 and k.closed_at is null and k.closes_at>clock_timestamp()',[event.askId,p.personId]);
     // They may have been the last one the ask was waiting for.
     await closeDayAskIfAnswered(ctx.q,ctx.team,event.askId,event.id);
    }
   }
   // The invites have gone out: this member's calendar gets the entry, or loses it. Nobody else's changes.
   else if(event.invited)await (data.interested?inviteOne:cancelOne)(ctx.q,ctx.team,event.id,p.personId);
  }
  return {saved:true,interested:data.interested,declined:data.decline,changed:marked.length+noted.length>0,event:bare((await viewEvents(ctx.q,ctx.p,ctx.timezone,[event.id]))[0])};
 });
}

export type EventWithPeople=EventView&{people:Member[];morePeople:number};
export type Upcoming={team:TeamHead;timezone:string;today:string;events:Listed<EventView|EventWithPeople>;untrusted:true};
const PEOPLE=100;
/** Who is interested, per event: current members only, by handle to an assistant and also by name on the site. No order of arrival. */
async function interested(q:Q,p:Principal,team:Scope,eventIds:string[]):Promise<(eventId:string)=>{people:Member[];morePeople:number}> {
 const {rows}=eventIds.length?await q.query<{eventId:string;personId:string}>(`select i.event_id as "eventId",i.person_id as "personId" from emba_event_interest i
  where i.event_id=any($3::uuid[]) and ${posts('i.person_id')} order by i.event_id,i.person_id`,[team.orgId,team.loopId,eventIds]):{rows:[]};
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
export type EventOutside={group:string;name:string;startsAt:string;endsAt:string|null;starts:string;ends:string|null;timezone:string;place:string|null;interested:number|null;
 /** Present, and true, when the event came from a link or a feed that no longer lists it. */
 sourceGone?:true};
/** How a group lets a signed-in person in from a share link: null when its join link is off. */
export type JoinStep={mode:'ask_first'|'admit';requested:boolean}|null;
export type EventShare=
 |{view:'member';namespace:string;groupSlug:string;scope:Scope;detail:EventDetail;outside:EventOutside}
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
 const {rows:[found]}=await db.query<Omit<EventOutside,'sourceGone'>&Scope&{gone:boolean;slug:string;namespace:string;groupSlug:string;count:number;mode:'ask_first'|'admit'|null;requested:boolean}>(`select e.org_id as "orgId",e.loop_id as "loopId",e.slug,a.namespace,a.slug as "groupSlug",coalesce((select g.name from emba_loop g where g.org_id=e.org_id and g.id=e.loop_id),o.name) as "group",e.name,
   e.starts_at as "startsAt",e.ends_at as "endsAt",${local('e.starts_at',"coalesce(s.timezone,'UTC')")} as starts,${local('e.ends_at',"coalesce(s.timezone,'UTC')")} as ends,coalesce(s.timezone,'UTC') as timezone,e.place,e.source_gone_at is not null as gone,
   (select count(*) from emba_event_interest i where i.event_id=e.id and ${posts('i.person_id','e.org_id','e.loop_id')})::int as count,
   (select l.join_mode from emba_group_request_link l where l.org_id=e.org_id and l.loop_id=e.loop_id and l.disabled_at is null) as mode,
   exists(select 1 from emba_group_membership_request r where r.org_id=e.org_id and r.loop_id=e.loop_id and r.person_id=$2::uuid and r.state='pending') as requested
  from emba_team_event e join emba_group_address a on a.org_id=e.org_id and a.loop_id=e.loop_id and a.retired_at is null join emba_organization o on o.id=e.org_id
   left join emba_team_state s on s.org_id=e.org_id and s.loop_id=e.loop_id
  where e.share_token=$1 and e.archived_at is null and e.starts_at is not null`,[shareToken,p?.personId??null]);
 if(!found)throw new EmbaError('not_found');
 const {orgId,loopId,slug,namespace,groupSlug,count,mode,requested,gone,...facts}=found;
 const outside:EventOutside={...facts,interested:count>=EVENTS.floor?count:null,...(gone?{sourceGone:true as const}:{})};
 // Only a person on the site is ever shown the member view; an assistant has its own tools.
 if(p&&p.clientId===null){
  try{return {view:'member',namespace,groupSlug,scope:{orgId,loopId},detail:await eventDetail(db,p,{orgId,loopId,event:slug}),outside};}
  catch(error){if(!(error instanceof EmbaError)||(error.code!=='forbidden'&&error.code!=='not_found'))throw error;}
 }
 return {view:'outside',outside,signedIn:Boolean(p),join:mode?{mode,requested}:null};
}

/** What is on: fixed events, plans, and the ideas members can still say they are in on, each with who is interested or in. */
export type DayList={team:TeamHead;timezone:string;today:string;
 /** The day asked about, or null for everything that has not ended. */
 day:string|null;
 events:EventWithPeople[];plans:EventWithPeople[];
 /** Those closest to the number they need come first. */
 ideas:Listed<EventWithPeople>;untrusted:true};
const dayOf=z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(`${value}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().startsWith(value);});
/**
 * One day in the team's timezone, or with no day everything that has not
 * ended. An idea with no start time belongs to the day those who are in
 * chose, else to each day its proposer offered, else to every day. This is a
 * list: it ranks nothing and recommends nothing.
 */
export async function whatsOn(db:Db,p:Principal,input:unknown):Promise<DayList> {
 const {day,...team}=z.strictObject({...scope,day:dayOf.optional()}).parse(input);
 return settled(db,team,check=>reading(db,p,team,async({q,...base})=>{
  await check(q);
  const on="(e.starts_at at time zone $3)::date=$4::date";
  // Two lists with a limit each, so a long programme never pushes an idea out. A team holds at most 100 open ideas.
  const {rows}=await q.query<{id:string;total:number}>(`(select e.id,0 as total,e.starts_at,e.slug from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and e.state in ('fixed','planned') and e.archived_at is null and ${day?on:upcoming}
    order by e.starts_at asc nulls last,e.slug limit ${EVENTS.list*2})
   union all (select e.id,count(*) over()::int as total,e.starts_at,e.slug from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and ${openIdea()}
     and ($4::date is null or case when e.starts_at is not null then ${on} when e.day is not null then e.day=$4::date else cardinality(e.offered_days)=0 or $4::date=any(e.offered_days) end)
    order by e.starts_at asc nulls last,e.slug limit ${IDEAS.openPerTeam})
   order by starts_at asc nulls last,slug`,[team.orgId,team.loopId,base.timezone,day??null]);
  const views=await viewEvents(q,p,base.timezone,rows.map(row=>row.id)),who=await interested(q,p,team,views.map(view=>view.id));
  const full=views.map(view=>({...bare(view),...who(view.id)}));
  const ideas=full.filter(view=>view.idea?.state==='idea').sort((a,b)=>a.idea!.needs-b.idea!.needs);
  return {team:base.team,timezone:base.timezone,today:base.today,day:day??null,events:full.filter(view=>!view.idea),plans:full.filter(view=>view.idea?.state==='planned'),
   ideas:{items:ideas,more:Math.max(0,Math.max(0,...rows.map(row=>row.total))-ideas.length)},untrusted:true as const};
 }));
}
