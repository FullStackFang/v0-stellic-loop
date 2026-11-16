import 'server-only';
import {z} from 'zod';
import type {Db} from '../db';
import type {Principal} from './access';
import {queueDayAsk} from './reach-send';
import {cancelAll,inviteAll} from './team-calendar';
import {logChange,posts,scope,stop,teamWrite,type Refused,type WriteCtx} from './team-core';
import {bare,endDayAsk,facts,IDEAS,lapseDue,link,openIdea,times,viewEvents,type EventView} from './team-events';
import type {LinkProblem} from './team-link';
import {lineSchema,nameSchema,singleLine} from './team-text';

// Ideas and plans (design D3, D4, D8 of loop-trip). An idea is an event a
// member proposes, with the number of people it needs. Saying "I'm in" is the
// interest mark every event has. The idea becomes a plan in the write that
// gives it the last person or the last detail, under the team's lock, so it
// happens once. A plan stays a plan; its proposer, an owner or an organizer
// can change or cancel it.

export type IdeaWrite=
 |{saved:true;changed:boolean;
  /** The idea as it stands after this write: `event.idea.state` is `planned` once it has become a plan. */
  event:EventView}
 |Refused
 |{saved:false;reason:'cap';cap:'own_open_ideas'|'open_ideas'}
 |{saved:false;reason:'unknown_event';value:string}
 // Changing and cancelling belong to the person who proposed it and to owners and organizers.
 |{saved:false;reason:'not_yours'}
 |{saved:false;reason:'in_the_past'}
 |{saved:false;reason:'offered_day_past'}
 // A plan keeps its start time and its place: they can be changed, not cleared.
 |{saved:false;reason:'plan_needs_time_and_place'}
 |{saved:false;reason:'end_before_start'}
 |{saved:false;reason:'end_needs_start'}
 |{saved:false;reason:'link_refused';problem:LinkProblem};
type Declined=Exclude<IdeaWrite,{saved:true}|Refused>;
type Work=Exclude<IdeaWrite,Refused>;
const no=(declined:Declined)=>stop<Declined>(declined);
const view=async(ctx:WriteCtx,id:string,changed:boolean):Promise<Work>=>({saved:true,changed,event:bare((await viewEvents(ctx.q,ctx.p,ctx.timezone,[id]))[0])});

const day=z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(`${value}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().startsWith(value);});
const days=z.array(day).max(IDEAS.offered).transform(list=>[...new Set(list)].sort());
const title=lineSchema(IDEAS.name);
/** Refuses a start that has passed, and an offered day before today in the team's timezone. */
async function ahead(ctx:WriteCtx,startsAt:string|null,offered:string[]):Promise<void> {
 const {rows:[row]}=await ctx.q.query<{past:boolean;stale:boolean}>(`select coalesce($1::timestamptz<=clock_timestamp(),false) as past,exists(select 1 from unnest($2::date[]) d where d<(clock_timestamp() at time zone $3)::date) as stale`,[startsAt,offered,ctx.timezone]);
 if(row.past)no({saved:false,reason:'in_the_past'});
 if(row.stale)no({saved:false,reason:'offered_day_past'});
}

/**
 * An idea that has the people it needs. With a start time and a place it
 * becomes a plan, here and once: invites go to everyone who is in. With no
 * start time and no day, Loop opens the one ask it ever opens for the idea, in
 * the proposer's name, to the members who are in. With no place it does
 * nothing: the proposer is shown that the idea needs one. The caller holds the
 * team's lock and calls this after every write that adds a person or a detail.
 */
export async function settle(ctx:WriteCtx,eventId:string):Promise<void> {
 const {q,team}=ctx;
 const {rows:[idea]}=await q.query<{name:string;proposerId:string|null;needed:number;dated:boolean;placed:boolean;hasDay:boolean;askId:string|null;n:number}>(`select e.name,e.proposer_id as "proposerId",e.needed::int as needed,e.starts_at is not null as dated,e.place is not null as placed,e.day is not null as "hasDay",e.day_ask_id as "askId",
   (select count(*) from emba_event_interest i where i.event_id=e.id and ${posts('i.person_id')})::int as n
  from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and e.id=$3 and ${openIdea()} for update`,[team.orgId,team.loopId,eventId]);
 if(!idea||idea.n<idea.needed)return;
 if(idea.dated&&idea.placed){
  await q.query("update emba_team_event set state='planned',invites_at=clock_timestamp() where id=$1",[eventId]);
  // Loop made it a plan; no one member did.
  await logChange(q,team,'event_planned',{eventId},null,null);
  await endDayAsk(q,team,idea.askId);
  await inviteAll(q,team,eventId);
  return;
 }
 if(idea.dated||idea.hasDay||idea.askId||!idea.proposerId)return;
 // The days to choose from: those the proposer offered that have not passed, else the days left of the trip
 // (tomorrow to the day of the last fixed event), else the next seven days.
 const {rows:options}=await q.query<{day:string}>(`with t as (select (clock_timestamp() at time zone $4)::date as today),
   last as (select max((x.starts_at at time zone $4)::date) as day from emba_team_event x where x.org_id=$1 and x.loop_id=$2 and x.state='fixed' and x.archived_at is null and x.starts_at>clock_timestamp()),
   offered as (select d from emba_team_event e,unnest(e.offered_days) d,t where e.id=$3 and d>=t.today),
   rest as (select g::date as d from t,last,generate_series((t.today+1)::timestamp,(case when last.day>t.today then last.day else t.today+7 end)::timestamp,interval '1 day') g)
  select to_char(d,'YYYY-MM-DD') as day from (select d from offered union all select d from rest where not exists(select 1 from offered)) s order by d limit ${IDEAS.askDays}`,[team.orgId,team.loopId,eventId,ctx.timezone]);
 // One day to choose from is no question.
 if(options.length<2){
  if(options.length)await q.query('update emba_team_event set day=$2::date where id=$1',[eventId,options[0].day]);
  return;
 }
 const question=singleLine(`Which day for ${idea.name}?`);
 const {rows:[ask]}=await q.query<{id:string}>(`insert into emba_ask(org_id,loop_id,number,asker_id,event_id,question,kind,reveal,only_in,created_at,closes_at)
  select $1,$2,$3,$4,$5,$6,'dates','named',true,now,now+interval '${IDEAS.askHours} hours' from (select date_trunc('milliseconds',clock_timestamp()) as now) t returning id`,[team.orgId,team.loopId,await ctx.nextNumber(),idea.proposerId,eventId,question]);
 for(const [index,option] of options.entries())await q.query('insert into emba_ask_option(ask_id,position,label) values($1,$2,$3)',[ask.id,index+1,option.day]);
 await q.query('update emba_team_event set day_ask_id=$2 where id=$1',[eventId,ask.id]);
 await logChange(q,team,'asked',{askId:ask.id},null,null);
 await queueDayAsk(q,team,ask.id,eventId);
}

/** A tag for the idea made from its name: the first that is free among `name`, `name-2`, and so on. */
async function freeSlug(ctx:WriteCtx,name:string):Promise<string> {
 const made=name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');
 const base=nameSchema.safeParse(made).success?made:'idea';
 const candidates=[base,...Array.from({length:60},(_,index)=>`${base}-${index+2}`)];
 const {rows}=await ctx.q.query<{name:string}>('select name from emba_team_name where org_id=$1 and name=any($2::text[])',[ctx.team.orgId,candidates]);
 const free=candidates.find(candidate=>!rows.some(row=>row.name===candidate));
 return free??stop<Refused>({saved:false,reason:'busy'});
}

const proposeSchema=z.strictObject({...scope,name:title,needed:z.number().int().min(IDEAS.needMin).max(IDEAS.needMax).default(IDEAS.needDefault),...facts,offeredDays:days.default([])});
/**
 * Proposes an idea. Any member who may post, on the site or through an
 * assistant with a read-and-write grant. The proposer is counted as in.
 */
export async function proposeIdea(db:Db,p:Principal,input:unknown):Promise<IdeaWrite> {
 const data=proposeSchema.parse(input);
 // Two ideas of the same name proposed at once: the second is asked to try again and gets the next tag.
 return teamWrite<IdeaWrite>(db,p,data,{need:'post',lock:true,count:true,taken:{saved:false,reason:'busy'}},async ctx=>{
  await lapseDue(ctx.q,ctx.team);
  const url=data.url?link(data.url):null;
  const {rows:[open]}=await ctx.q.query<{own:number;team:number}>(`select count(*) filter(where e.proposer_id=$3)::int as own,count(*)::int as team from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and ${openIdea()}`,[data.orgId,data.loopId,p.personId]);
  if(open.own>=IDEAS.openPerMember)no({saved:false,reason:'cap',cap:'own_open_ideas'});
  if(open.team>=IDEAS.openPerTeam)no({saved:false,reason:'cap',cap:'open_ideas'});
  const when=await times(ctx,data.startsAt??null,data.endsAt??null);
  await ahead(ctx,when.s,data.offeredDays);
  const slug=await freeSlug(ctx,data.name);
  const {rows:[row]}=await ctx.q.query<{id:string}>(`insert into emba_team_event(org_id,loop_id,slug,name,created_by,proposer_id,state,needed,starts_at,ends_at,place,url,note,offered_days)
   values($1,$2,$3,$4,$5,$5,'idea',$6,$7,$8,$9,$10,$11,$12::date[]) returning id`,[data.orgId,data.loopId,slug,data.name,p.personId,data.needed,when.s,when.e,data.place??null,url,data.note??null,data.offeredDays]);
  await ctx.q.query('insert into emba_event_interest(event_id,org_id,loop_id,person_id,route,client_id) values($1,$2,$3,$4,$5,$6)',[row.id,data.orgId,data.loopId,p.personId,p.clientId===null?'site':'assistant',p.clientId]);
  await ctx.log('event_proposed',{eventId:row.id});
  return view(ctx,row.id,true);
 });
}

type Held={id:string;state:'idea'|'planned';proposerId:string|null;name:string;startsAt:string|null;endsAt:string|null;place:string|null;url:string|null;note:string|null;offered:string[];day:string|null;askId:string|null;invited:boolean};
/** Locks the idea or plan behind a tag, for its proposer or an owner or organizer. */
async function held(ctx:WriteCtx,slug:string):Promise<Held> {
 const {rows:[row]}=await ctx.q.query<Held>(`select e.id,e.state,e.proposer_id as "proposerId",e.name,e.starts_at as "startsAt",e.ends_at as "endsAt",e.place,e.url,e.note,
   array(select to_char(d,'YYYY-MM-DD') from unnest(e.offered_days) d order by d) as offered,to_char(e.day,'YYYY-MM-DD') as day,e.day_ask_id as "askId",e.invites_at is not null as invited
  from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and e.slug=$3 and e.state in ('idea','planned') and e.archived_at is null for update`,[ctx.team.orgId,ctx.team.loopId,slug]);
 if(!row)return no({saved:false,reason:'unknown_event',value:slug});
 if(row.proposerId!==ctx.p.personId&&!ctx.manager)no({saved:false,reason:'not_yours'});
 return row;
}
const changeSchema=z.strictObject({...scope,event:nameSchema,name:title.optional(),...facts,offeredDays:days.optional(),
 /** The day, while the idea has no start time: how the proposer settles a tie. */
 day:day.nullish()});
/**
 * Changes an idea or a plan: its name, start, end, place, link, note, the
 * days on offer, or its day. Fields left out stay as they are; null clears
 * one. The number it needs is not changed. Its proposer, or an owner or
 * organizer.
 */
export async function changeIdea(db:Db,p:Principal,input:unknown):Promise<IdeaWrite> {
 const data=changeSchema.parse(input);
 return teamWrite<Work>(db,p,data,{need:'post',lock:true,count:true},async ctx=>{
  await lapseDue(ctx.q,ctx.team);
  const row=await held(ctx,data.event);
  const url=data.url===undefined?row.url:data.url===null?null:link(data.url);
  const when=await times(ctx,data.startsAt===undefined?row.startsAt:data.startsAt,data.endsAt===undefined?row.endsAt:data.endsAt);
  const next={name:data.name??row.name,startsAt:when.s,endsAt:when.e,place:data.place===undefined?row.place:data.place,url,note:data.note===undefined?row.note:data.note,
   offered:data.offeredDays??row.offered,day:data.day===undefined?row.day:data.day};
  if(row.state==='planned'&&(!next.startsAt||!next.place))no({saved:false,reason:'plan_needs_time_and_place'});
  const moved=(key:'startsAt'|'endsAt')=>next[key]===null?row[key]!==null:row[key]===null||Date.parse(next[key]!)!==Date.parse(row[key]!);
  const timeOrPlace=moved('startsAt')||moved('endsAt')||next.place!==row.place;
  const changed=timeOrPlace||next.name!==row.name||next.url!==row.url||next.note!==row.note||next.offered.join()!==row.offered.join()||next.day!==row.day;
  if(!changed)return view(ctx,row.id,false);
  // Only what was newly stated is held to the present: an old plan's name can still be corrected.
  await ahead(ctx,moved('startsAt')?next.startsAt:null,[...(next.day&&next.day!==row.day?[next.day]:[]),...(next.offered.join()!==row.offered.join()?next.offered:[])]);
  await ctx.q.query('update emba_team_event set name=$2,starts_at=$3,ends_at=$4,place=$5,url=$6,note=$7,offered_days=$8::date[],day=$9::date where id=$1',[row.id,next.name,next.startsAt,next.endsAt,next.place,next.url,next.note,next.offered,next.day]);
  if(timeOrPlace)await ctx.log('event_changed',{eventId:row.id});
  // The day is settled, by a start time or by the proposer: the ask for it has nothing left to decide.
  if(next.startsAt||next.day!==row.day)await endDayAsk(ctx.q,ctx.team,row.askId,p.personId,p.clientId);
  if(row.state==='planned'){if(timeOrPlace&&row.invited)await inviteAll(ctx.q,ctx.team,row.id);}
  else await settle(ctx,row.id);
  return view(ctx,row.id,true);
 });
}
/** Cancels an idea or a plan. Its proposer, or an owner or organizer. It is not revived. */
export async function cancelIdea(db:Db,p:Principal,input:unknown):Promise<IdeaWrite> {
 const data=z.strictObject({...scope,event:nameSchema}).parse(input);
 return teamWrite<Work>(db,p,data,{need:'post',lock:true,count:true},async ctx=>{
  await lapseDue(ctx.q,ctx.team);
  const row=await held(ctx,data.event);
  await ctx.q.query("update emba_team_event set state='cancelled',archived_at=clock_timestamp() where id=$1",[row.id]);
  await ctx.log('event_cancelled',{eventId:row.id});
  await endDayAsk(ctx.q,ctx.team,row.askId,p.personId,p.clientId);
  if(row.invited)await cancelAll(ctx.q,ctx.team,row.id);
  return view(ctx,row.id,true);
 });
}
