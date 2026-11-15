import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import {canAccessLoop,type Principal} from './access';
import {EmbaError} from './errors';
import {listGroups} from './groups';
import {openAsks,type Unanswered} from './team-asks';
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
const none:{id:string;total:number}[]=[];
type TeamWaiting={team:TeamHead;found:Found[];total:number};

async function records(q:Q,p:Principal,team:Scope,head:TeamHead,kind:'mention'|'announcement'):Promise<{found:Found[];total:number}> {
 const {rows}=await q.query<Row&{total:number}>(`select ${rowColumns},count(*) over()::int as total from ${rowFrom} where ${unshown} and ${kind==='mention'?mentions:"r.kind='announcement'"}
  order by r.number desc limit ${WAITING.items}`,[team.orgId,team.loopId,p.personId]);
 const views=await viewRecords(q,p,team,rows);
 return {found:views.map((record,index)=>({item:{kind,team:head,record},recordId:rows[index].id,key:-rows[index].number})),total:rows[0]?.total??0};
}
/** One team's waiting items inside one snapshot: up to 10 of each kind, and how many there are in all. */
async function teamWaiting(db:Db,p:Principal,team:Scope):Promise<TeamWaiting> {
 return settled(db,team,check=>reading(db,p,team,async({q,...base})=>{
  await check(q);
  const asks=(await openAsks(q,p,team,base.timezone)).unanswered;
  // Interest belongs to members who may post, so no event waits for a follower.
  const {rows:events}=await canAccessLoop(q,p,team.orgId,team.loopId,'post')?await q.query<{id:string;total:number}>(`select e.id,count(*) over()::int as total from emba_team_event e where ${eventWaits}
   order by e.starts_at,e.slug limit ${WAITING.items}`,[team.orgId,team.loopId,p.personId]):{rows:none};
  const eventViews=await viewEvents(q,p,base.timezone,events.map(row=>row.id));
  const {rows:ideas}=events===none?{rows:[]}:await q.query<{id:string;why:IdeaWaits;total:number}>(`select x.id,x.why,count(*) over()::int as total from (select e.id,e.starts_at,e.slug,${ideaWhy} as why from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and ${openIdea()}) x
   where x.why is not null order by x.starts_at asc nulls last,x.slug limit ${WAITING.items}`,[team.orgId,team.loopId,p.personId]);
  const ideaViews=await viewEvents(q,p,base.timezone,ideas.map(row=>row.id));
  const mentioned=await records(q,p,team,base.team,'mention'),announced=await records(q,p,team,base.team,'announcement');
  return {team:base.team,total:asks.items.length+asks.more+(events[0]?.total??0)+(ideas[0]?.total??0)+mentioned.total+announced.total,found:[
   ...asks.items.slice(0,WAITING.items).map(ask=>({item:{kind:'ask' as const,team:base.team,ask},key:Date.parse(ask.closesAt)})),
   ...eventViews.map(event=>({item:{kind:'event' as const,team:base.team,event:bare(event)},key:Date.parse(event.startsAt!)})),
   // An idea with no time yet sorts after those that have one.
   ...ideaViews.map((event,index)=>({item:{kind:'idea' as const,team:base.team,event:bare(event),why:ideas[index].why},key:event.startsAt?Date.parse(event.startsAt):Number.MAX_SAFE_INTEGER})),
   ...mentioned.found,...announced.found]};
 }));
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
