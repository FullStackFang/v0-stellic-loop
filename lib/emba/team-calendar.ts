import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import {feedIcs,type CalendarEntry} from '../ics';
import {appUrl} from '../url';
import {canAccessLoop,type Principal} from './access';
import {audit,requireFirstParty} from './consent';
import {EmbaError} from './errors';
import {belongsTo,posts,scope,stop,teamWrite,type Refused,type Scope} from './team-core';
import {nameSchema} from './team-text';

// Calendar (design D5, D6 of loop-trip). Loop keeps no calendar of its own: a
// plan reaches a member's calendar as an invite by email, and a team's fixed
// events and plans can be subscribed to as a feed. An invite is queued in the
// write that causes it, as a row of emba_reach_message, and sent by the
// scheduled run under the member's reach choice. Every version of an entry
// carries the event's next sequence number, so a later one replaces it.

/** The one switch for outbound messages. Kept here as well so the event modules need not load the sender. */
const sendingOn=()=>process.env.LOOP_REACH_SENDING==='on';
/** The calendar entry's identity: the event's share token, which names the event and grants nothing. */
export const calendarUid=(shareToken:string)=>{
 let host='loop';
 try{host=new URL(process.env.NEXT_PUBLIC_APP_URL??'').hostname||host;}catch{}
 return `${shareToken}@${host}`;
};
/** The address invites come from: the calendar file names it as the sender, so the provider must send these messages from it. */
export const inviteSender=()=>{
 let host='loop.invalid';
 try{host=new URL(process.env.NEXT_PUBLIC_APP_URL??'').hostname||host;}catch{}
 return process.env.LOOP_INVITE_FROM||`invites@${host}`;
};
/** The next version of the event's calendar entry. The caller holds the team's lock. */
const next=async(q:Q,eventId:string)=>(await q.query<{n:number}>('update emba_team_event set sequence=sequence+1 where id=$1 returning sequence as n',[eventId])).rows[0].n;
const queue=async(q:Q,team:Scope,eventId:string,kind:'invite'|'invite_cancel',personId:string|null)=>{
 const sequence=await next(q,eventId);
 if(!sendingOn())return;
 await q.query(`insert into emba_reach_message(org_id,loop_id,person_id,kind,event_id,sequence)
  select $1,$2,i.person_id,$4,$3::uuid,$5 from emba_event_interest i where i.event_id=$3 and ($6::uuid is null or i.person_id=$6) and ${posts('i.person_id')} on conflict do nothing`,[team.orgId,team.loopId,eventId,kind,sequence,personId]);
};
/** A new version of the entry for every member who is in: the first invite, or a change of time or place. */
export const inviteAll=(q:Q,team:Scope,eventId:string)=>queue(q,team,eventId,'invite',null);
/** The invite for one member who said they are in after the invites went out. */
export const inviteOne=(q:Q,team:Scope,eventId:string,personId:string)=>queue(q,team,eventId,'invite',personId);
/** The event is off: a cancellation for every member who is in. */
export const cancelAll=(q:Q,team:Scope,eventId:string)=>queue(q,team,eventId,'invite_cancel',null);
/** One member dropped out: a cancellation for them alone. Their mark is already gone, so the row names them directly. */
export async function cancelOne(q:Q,team:Scope,eventId:string,personId:string):Promise<void> {
 const sequence=await next(q,eventId);
 if(!sendingOn())return;
 await q.query("insert into emba_reach_message(org_id,loop_id,person_id,kind,event_id,sequence) values($1,$2,$3,'invite_cancel',$4,$5) on conflict do nothing",[team.orgId,team.loopId,personId,eventId,sequence]);
}

export type InviteWrite=
 |{saved:true;
  /** How many members are interested. Each gets the invite only if their reach choice for the team allows email. */
  interested:number;
  /** False when outbound messages are switched off: nothing was queued. */
  sending:boolean}
 |Refused
 |{saved:false;reason:'unknown_event';value:string}
 |{saved:false;reason:'no_date'};
/**
 * An owner or organizer chooses to send a fixed event as a calendar invite to
 * the members who marked interest. From then on the event behaves as a plan
 * does in calendars: a member who marks interest later gets the invite, one
 * who takes it back gets a cancellation, and a change of time or place or an
 * archive reaches every calendar it is in.
 */
export async function sendEventInvites(db:Db,p:Principal,input:unknown):Promise<InviteWrite> {
 const data=z.strictObject({...scope,event:nameSchema}).parse(input);
 type Declined=Exclude<InviteWrite,{saved:true}|Refused>;
 return teamWrite<Exclude<InviteWrite,Refused>>(db,p,data,{need:'manage',lock:true,count:true},async ctx=>{
  const {rows:[event]}=await ctx.q.query<{id:string;dated:boolean}>("select id,starts_at is not null as dated from emba_team_event where org_id=$1 and loop_id=$2 and slug=$3 and state='fixed' and archived_at is null for update",[data.orgId,data.loopId,data.event]);
  if(!event)return stop<Declined>({saved:false,reason:'unknown_event',value:data.event});
  if(!event.dated)stop<Declined>({saved:false,reason:'no_date'});
  await ctx.q.query('update emba_team_event set invites_at=coalesce(invites_at,clock_timestamp()) where id=$1',[event.id]);
  await inviteAll(ctx.q,ctx.team,event.id);
  const {rows:[count]}=await ctx.q.query<{n:number}>(`select count(*)::int as n from emba_event_interest i where i.event_id=$3 and ${posts('i.person_id')}`,[data.orgId,data.loopId,event.id]);
  return {saved:true,interested:count.n,sending:sendingOn()};
 });
}

const feedUrl=(token:string)=>appUrl(`/api/calendar/${token}/loop.ics`);
/** A member or follower of the team, on the site. A feed address is never shown to or made by an assistant. */
async function mayHoldFeed(q:Q,p:Principal,team:Scope):Promise<void> {
 await requireFirstParty(q,p);
 if(!await canAccessLoop(q,p,team.orgId,team.loopId,'read'))throw new EmbaError('forbidden');
}
/** Site only: the caller's calendar feed address for a team, or null when they have not made one. */
export async function feedAddress(db:Db,p:Principal,input:unknown):Promise<string|null> {
 const team=z.strictObject(scope).parse(input);
 return db.tx(async q=>{
  await mayHoldFeed(q,p,team);
  const {rows:[row]}=await q.query<{token:string}>('select token from emba_calendar_feed where org_id=$1 and loop_id=$2 and person_id=$3',[team.orgId,team.loopId,p.personId]);
  return row?feedUrl(row.token):null;
 });
}
/** Site only: makes the caller's feed address for a team, or replaces it. The address it replaces returns nothing from then on. */
export async function newFeedAddress(db:Db,p:Principal,input:unknown):Promise<string> {
 const team=z.strictObject(scope).parse(input);
 return db.tx(async q=>{
  await mayHoldFeed(q,p,team);
  const {rows}=await q.query('select 1 from emba_group_address where org_id=$1 and loop_id=$2 and retired_at is null for share',[team.orgId,team.loopId]);
  if(!rows.length)throw new EmbaError('forbidden');
  const {rows:[row]}=await q.query<{token:string}>(`insert into emba_calendar_feed(org_id,loop_id,person_id) values($1,$2,$3)
   on conflict(org_id,loop_id,person_id) do update set token=replace(gen_random_uuid()::text,'-',''),created_at=clock_timestamp() returning token`,[team.orgId,team.loopId,p.personId]);
  await audit(q,p,'activity:write',team.loopId);
  return feedUrl(row.token);
 });
}

export const FEED={entries:300,pastDays:30} as const;
/**
 * The calendar behind a feed address, or null when the address is unknown,
 * was replaced, or belongs to someone who has left the team. It holds the
 * team's dated fixed events and its plans: name, time and place. It holds no
 * person's name, no idea that is not yet a plan, and no travel.
 */
export async function calendarFeed(db:Db,token:string):Promise<string|null> {
 if(!/^[0-9a-f]{32}$/.test(token))return null;
 return db.tx(async q=>{
  await q.query('set transaction isolation level repeatable read');
  const {rows:[feed]}=await q.query<Scope&{name:string}>(`select f.org_id as "orgId",f.loop_id as "loopId",coalesce(l.name,o.name) as name from emba_calendar_feed f
    join emba_group_address a on a.org_id=f.org_id and a.loop_id=f.loop_id and a.retired_at is null join emba_loop l on l.org_id=f.org_id and l.id=f.loop_id join emba_organization o on o.id=f.org_id
   where f.token=$1 and ${belongsTo('f.person_id','f.org_id','f.loop_id')}`,[token]);
  if(!feed)return null;
  const {rows}=await q.query<{token:string;sequence:number;startsAt:string;endsAt:string|null;name:string;place:string|null}>(`select e.share_token as token,e.sequence,e.starts_at as "startsAt",e.ends_at as "endsAt",e.name,e.place from emba_team_event e
   where e.org_id=$1 and e.loop_id=$2 and e.state in ('fixed','planned') and e.archived_at is null and e.starts_at is not null and coalesce(e.ends_at,e.starts_at)>clock_timestamp()-interval '${FEED.pastDays} days'
   order by e.starts_at,e.slug limit ${FEED.entries}`,[feed.orgId,feed.loopId]);
  const entries=rows.map((row):CalendarEntry=>({uid:calendarUid(row.token),sequence:row.sequence,start:new Date(row.startsAt),end:row.endsAt?new Date(row.endsAt):null,summary:row.name,location:row.place,description:feed.name,url:appUrl(`/e/${row.token}`)}));
  return feedIcs({name:feed.name,entries});
 });
}
