import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import {canAccessLoop,type Principal} from './access';
import {EmbaError} from './errors';
import {listGroups} from './groups';
import {asksOnYou,openAsks,type Unanswered} from './team-asks';
import {posts,reading,type Scope,type TeamHead} from './team-core';
import {bare,openIdea,settled,viewEvents,type EventView} from './team-events';
import {rowColumns,rowFrom,viewRecords,type RecordView,type Row} from './team-records';

// What is waiting for one member across their teams (design D1, D8b of
// loop-club-reach). An item waits until the member acts on it, not until a
// cursor passes it: an ask until they answer or it closes, an event until they
// mark interest, say it is not for them, or it ends, an idea while it is one
// person short or needs something from its proposer, and a mention or an
// announcement until it has been returned to them once. Nothing here is about
// anyone but the caller, and nothing is read from a team the caller's
// assistant holds no grant for.

export const WAITING={items:10,teams:50} as const;
export type WaitingItem=
 |{kind:'ask';team:TeamHead;ask:Unanswered}
 |{kind:'event';team:TeamHead;event:EventView}
 /**
  * An idea (loop-trip). `one_short`: it needs one more person and the caller is not in. The rest are for its proposer, once it has
  * the people it needs: it has no place, the day is chosen and it has no time, or the ask for its day ended with no clear answer.
  */
 |{kind:'idea';team:TeamHead;event:EventView;why:IdeaWaits}
 |{kind:'mention'|'announcement';team:TeamHead;record:RecordView};
export type IdeaWaits='one_short'|'needs_place'|'needs_time'|'choose_day';
export type Waiting={
 /** Everything waiting, including what is not listed. */
 count:number;
 /** At most 10: asks closing soonest first, then events soonest first, then ideas, then mentions, then announcements. */
 items:WaitingItem[];
 /** Where the rest is. */
 more:{team:TeamHead;count:number}[];
 untrusted:true};

/** SQL: a dated event that has not ended and that person $3 has neither marked, declined nor added. */
const eventWaits=`e.org_id=$1 and e.loop_id=$2 and e.state='fixed' and e.archived_at is null and e.starts_at is not null and coalesce(e.ends_at,e.starts_at)>clock_timestamp()
 and e.created_by is distinct from $3
 and not exists(select 1 from emba_event_interest i where i.event_id=e.id and i.person_id=$3)
 and not exists(select 1 from emba_event_decline d where d.event_id=e.id and d.person_id=$3)`;
/**
 * SQL: why an open idea waits for person $3, or null. For a member who is not in and has not said it is not for them: it is one
 * person short. For its proposer, once it has the people it needs: what it still lacks. While the ask for its day is open it waits
 * as that ask, not here.
 */
const ideaWhy=(()=>{
 const count=`(select count(*) from emba_event_interest i where i.event_id=e.id and ${posts('i.person_id')})`;
 const mine='exists(select 1 from emba_event_interest i where i.event_id=e.id and i.person_id=$3)';
 return `case when not ${mine} then (case when e.needed-${count}=1 and not exists(select 1 from emba_event_decline d where d.event_id=e.id and d.person_id=$3) then 'one_short' end)
  when e.proposer_id is distinct from $3 or ${count}<e.needed then null
  when e.starts_at is not null then (case when e.place is null then 'needs_place' end)
  when e.day is not null then 'needs_time'
  when e.day_ask_id is not null and not exists(select 1 from emba_ask k where k.id=e.day_ask_id and k.closed_at is null and k.closes_at>clock_timestamp()) then 'choose_day' end`;
})();
/** SQL: a current record person $3 did not write and has not been shown. */
const unshown=`r.org_id=$1 and r.loop_id=$2 and r.state='current' and r.author_id is distinct from $3
 and not exists(select 1 from emba_waiting_shown s where s.record_id=r.id and s.person_id=$3)`;
/** SQL: the record tags person $3, or is a claim proposed for them. */
const mentions=`r.kind<>'announcement' and (exists(select 1 from emba_team_record_tag t where t.record_id=r.id and t.person_id=$3) or (r.kind='claim' and r.claim_status='proposed' and r.owner_id=$3))`;

type Found={item:WaitingItem;
 /** Set for a mention or an announcement: the record to note as shown once it is returned. */
 recordId?:string;
 /** Where it sorts within its kind: soonest first for asks and events, newest first for records. */
 key:number};
type TeamWaiting={team:TeamHead;found:Found[];total:number};

async function records(q:Q,p:Principal,team:Scope,head:TeamHead,kind:'mention'|'announcement'):Promise<{found:Found[];total:number}> {
 const {rows}=await q.query<Row&{total:number}>(`select ${rowColumns},count(*) over()::int as total from ${rowFrom} where ${unshown} and ${kind==='mention'?mentions:"r.kind='announcement'"}
  order by r.number desc limit ${WAITING.items}`,[team.orgId,team.loopId,p.personId]);
 const views=await viewRecords(q,p,team,rows);
 return {found:views.map((record,index)=>({item:{kind,team:head,record},recordId:rows[index].id,key:-rows[index].number})),total:rows[0]?.total??0};
}
/** The dated events and the ideas that wait for the caller, soonest first: up to `limit` of each, and how many there are in all. */
async function eventsWaiting(q:Q,p:Principal,team:Scope,timezone:string,limit:number) {
 // Interest belongs to members who may post, so no event waits for a follower.
 if(!await canAccessLoop(q,p,team.orgId,team.loopId,'post'))return {events:[],eventTotal:0,ideas:[],ideaTotal:0};
 const {rows:events}=await q.query<{id:string;total:number}>(`select e.id,count(*) over()::int as total from emba_team_event e where ${eventWaits}
  order by e.starts_at,e.slug limit ${limit}`,[team.orgId,team.loopId,p.personId]);
 const {rows:ideas}=await q.query<{id:string;why:IdeaWaits;total:number}>(`select x.id,x.why,count(*) over()::int as total from (select e.id,e.starts_at,e.slug,${ideaWhy} as why from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and ${openIdea()}) x
  where x.why is not null order by x.starts_at asc nulls last,x.slug limit ${limit}`,[team.orgId,team.loopId,p.personId]);
 const eventViews=await viewEvents(q,p,timezone,events.map(row=>row.id)),ideaViews=await viewEvents(q,p,timezone,ideas.map(row=>row.id));
 return {events:eventViews.map(bare),eventTotal:events[0]?.total??0,ideas:ideaViews.map((event,index)=>({event:bare(event),why:ideas[index].why})),ideaTotal:ideas[0]?.total??0};
}
/** One team's waiting items inside one snapshot: up to 10 of each kind, and how many there are in all. */
async function teamWaiting(db:Db,p:Principal,team:Scope):Promise<TeamWaiting> {
 return settled(db,team,check=>reading(db,p,team,async({q,...base})=>{
  await check(q);
  const asks=(await openAsks(q,p,team,base.timezone)).unanswered;
  const {events,eventTotal,ideas,ideaTotal}=await eventsWaiting(q,p,team,base.timezone,WAITING.items);
  const mentioned=await records(q,p,team,base.team,'mention'),announced=await records(q,p,team,base.team,'announcement');
  return {team:base.team,total:asks.items.length+asks.more+eventTotal+ideaTotal+mentioned.total+announced.total,found:[
   ...asks.items.slice(0,WAITING.items).map(ask=>({item:{kind:'ask' as const,team:base.team,ask},key:Date.parse(ask.closesAt)})),
   ...events.map(event=>({item:{kind:'event' as const,team:base.team,event},key:Date.parse(event.startsAt!)})),
   // An idea with no time yet sorts after those that have one.
   ...ideas.map(({event,why})=>({item:{kind:'idea' as const,team:base.team,event,why},key:event.startsAt?Date.parse(event.startsAt):Number.MAX_SAFE_INTEGER})),
   ...mentioned.found,...announced.found]};
 }));
}

/** How many asks, events and ideas in one team still need the caller to act. Nothing is noted as shown. */
export async function teamNeedsYou(db:Db,p:Principal,team:Scope):Promise<number> {
 return (await teamWaiting(db,p,team)).found.filter(({item})=>item.kind==='ask'||item.kind==='event'||item.kind==='idea').length;
}

const order=['ask','event','idea','mention','announcement'] as const;
/**
 * What is waiting for the caller across every team they belong to and, through
 * an assistant, hold a grant for. The mentions and announcements it returns
 * are noted as shown, so they are returned once; asks and events come back on
 * every call until the caller acts on them.
 */
export async function waiting(db:Db,p:Principal,input:unknown={},
 /**
  * How many of the returned items, counted from the first, the caller goes on to state. A mention or an announcement after those is
  * not noted as shown, so it is returned again. With none given, every returned item counts as stated.
  */
 stated?:(result:Waiting)=>number):Promise<Waiting> {
 z.strictObject({}).parse(input);
 const denied=(error:unknown)=>error instanceof EmbaError&&error.code==='forbidden';
 // listGroups applies membership and the assistant's exact grants: a team without a grant is never opened.
 const groups=await listGroups(db,p,{limit:WAITING.teams}).catch(error=>{if(denied(error))return [];throw error;});
 const teams:TeamWaiting[]=[];
 for(const group of groups){
  // A grant or a role may have ended a moment ago: that team is left out, like one never granted.
  try{teams.push(await teamWaiting(db,p,{orgId:group.orgId,loopId:group.loopId}));}
  catch(error){if(!denied(error))throw error;}
 }
 const all=teams.flatMap(team=>team.found).sort((a,b)=>order.indexOf(a.item.kind)-order.indexOf(b.item.kind)||a.key-b.key);
 const chosen=all.slice(0,WAITING.items);
 const result:Waiting={count:teams.reduce((sum,team)=>sum+team.total,0),items:chosen.map(found=>found.item),
  more:teams.map(team=>({team:team.team,count:team.total-chosen.filter(found=>found.item.team.handle===team.team.handle).length})).filter(rest=>rest.count>0),untrusted:true as const};
 const shown=chosen.slice(0,stated?Math.max(0,stated(result)):chosen.length).flatMap(found=>found.recordId??[]);
 if(shown.length)await db.query('insert into emba_waiting_shown(person_id,record_id) select $1,unnest($2::uuid[]) on conflict do nothing',[p.personId,shown]);
 return result;
}

// What is on one member, for the site (openspec loop-on-you, on-you-page). The same things as above that have a day: asks to
// answer, things to do, events to say yes or no to, ideas that need them. Mentions and announcements are told, not done, so they
// stay with the assistant's read, and nothing here marks one as shown.
export const ON_YOU={rows:30,claims:10,together:3} as const;
export type OnYouRow=(
 |{kind:'ask';ask:Unanswered}
 /** Something to do that passed without the caller, in the last 7 days. It can no longer be done unless it is given a new time. */
 |{kind:'missed';ask:Unanswered}
 |{kind:'event';event:EventView}
 |{kind:'idea';event:EventView;why:IdeaWaits})&{team:TeamHead;
 /** The group the row belongs to, for the row's own controls. Site only: nothing here goes to an assistant. */
 scope:Scope};
export type OnYou={
 /** Everything still open on the caller, including what is not listed. What was missed is not counted. */
 count:number;
 /** At most 30: by when, whatever the kind and the group; then what was missed, latest first. */
 rows:OnYouRow[];
 /** Where the rest is. */
 more:{team:TeamHead;count:number}[];
 /** Work someone proposed for the caller, which waits for a yes or a no. Oldest first. */
 claims:{team:TeamHead;scope:Scope;record:RecordView}[];
 /** Every group that was read, with whether the caller may ask it something (a follower may not). */
 groups:{team:TeamHead;scope:Scope;timezone:string;posts:boolean}[];
 untrusted:true};
type TeamOnYou={team:TeamHead;scope:Scope;timezone:string;posts:boolean;open:number;total:number;rows:{row:OnYouRow;key:number}[];claims:{record:RecordView;at:number}[]};

async function teamOnYou(db:Db,p:Principal,team:Scope):Promise<TeamOnYou> {
 return settled(db,team,check=>reading(db,p,team,async({q,...base})=>{
  await check(q);
  const at={team:base.team,scope:team},late=Number.MAX_SAFE_INTEGER;
  const asks=await asksOnYou(q,p,team,base.timezone,ON_YOU.rows);
  const {events,eventTotal,ideas,ideaTotal}=await eventsWaiting(q,p,team,base.timezone,ON_YOU.rows);
  const {rows:proposed}=await q.query<Row>(`select ${rowColumns} from ${rowFrom} where r.org_id=$1 and r.loop_id=$2 and r.state='current' and r.kind='claim' and r.claim_status='proposed' and r.owner_id=$3
   order by r.number limit ${ON_YOU.claims}`,[team.orgId,team.loopId,p.personId]);
  const open=asks.open.total+eventTotal+ideaTotal;
  return {...at,timezone:base.timezone,posts:await canAccessLoop(q,p,team.orgId,team.loopId,'post'),open,total:open+asks.missed.total,claims:(await viewRecords(q,p,team,proposed)).map(record=>({record,at:Date.parse(record.createdAt)})),rows:[
   ...asks.open.items.map(ask=>({row:{kind:'ask' as const,...at,ask},key:Date.parse(ask.closesAt)})),
   ...events.map(event=>({row:{kind:'event' as const,...at,event},key:Date.parse(event.startsAt!)})),
   // An idea with no time yet comes after everything that has one.
   ...ideas.map(({event,why})=>({row:{kind:'idea' as const,...at,event,why},key:event.startsAt?Date.parse(event.startsAt):late-1})),
   ...asks.missed.items.map(ask=>({row:{kind:'missed' as const,...at,ask},key:late-Date.parse(ask.closesAt)}))]};
 }));
}
/** Everything on the caller across the groups they belong to, by when. Reading it changes nothing. */
export async function onYou(db:Db,p:Principal):Promise<OnYou> {
 const denied=(error:unknown)=>error instanceof EmbaError&&error.code==='forbidden';
 const groups=await listGroups(db,p,{limit:WAITING.teams}).catch(error=>{if(denied(error))return [];throw error;});
 const teams:TeamOnYou[]=[];
 // Each group is read in its own snapshot. A few at a time: every read holds a connection.
 for(let from=0;from<groups.length;from+=ON_YOU.together){
  const read=await Promise.all(groups.slice(from,from+ON_YOU.together).map(group=>teamOnYou(db,p,{orgId:group.orgId,loopId:group.loopId}).catch(error=>{if(denied(error))return null;throw error;})));
  teams.push(...read.flatMap(team=>team??[]));
 }
 const missed=(found:{row:OnYouRow})=>found.row.kind==='missed'?1:0;
 const chosen=teams.flatMap(team=>team.rows).sort((a,b)=>missed(a)-missed(b)||a.key-b.key).slice(0,ON_YOU.rows);
 return {count:teams.reduce((sum,team)=>sum+team.open,0),rows:chosen.map(found=>found.row),
  more:teams.map(team=>({team:team.team,count:team.total-chosen.filter(found=>found.row.scope===team.scope).length})).filter(rest=>rest.count>0),
  claims:teams.flatMap(team=>team.claims.map(claim=>({team:team.team,scope:team.scope,...claim}))).sort((a,b)=>a.at-b.at).slice(0,ON_YOU.claims).map(({at:_at,...claim})=>{void _at;return claim;}),
  groups:teams.map(({team,scope,timezone,posts})=>({team,scope,timezone,posts})),untrusted:true as const};
}
