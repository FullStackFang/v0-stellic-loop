import 'server-only';
import {z,ZodError} from 'zod';
import type {Db,Q} from '../db';
import {appUrl} from '../url';
import {canAccessLoop,type Principal} from './access';
import {requireFirstParty} from './consent';
import {EmbaError} from './errors';
import {cancelAll,inviteAll} from './team-calendar';
import {instant,local,logChange,moment,posts,scope,stop,teamWrite,type Refused,type Scope,type WriteCtx} from './team-core';
import {normaliseLink,type LinkProblem} from './team-link';
import {lineSchema,nameSchema} from './team-text';

// Events under a team (design D1, D6 of loop-club-events-and-asks). An event
// is a label for records; it may also carry a date, an end, a place, a link
// and a note. Owners and organizers manage events, on the site or through an
// assistant that holds a read-and-write grant for the team.

export const EVENTS={name:80,place:120,note:600,upcoming:50,list:30,graceHours:12,floor:5} as const;
/** Ideas (design D3, D8 of loop-trip): an event a member proposes, which becomes a plan once it has the people it needs, a start time and a place. */
export const IDEAS={name:120,needMin:2,needMax:20,needDefault:3,openPerMember:5,openPerTeam:100,offered:10,lapseHours:12,lapseDays:14,askHours:48,askDays:10} as const;
/** SQL: an idea whose time has run out by the database clock, whether or not that has been noted yet: 12 hours after its start, or 14 days after it was proposed when it has none. */
export const lapsedSql=(e='e')=>`(${e}.state='idea' and clock_timestamp()>=coalesce(${e}.starts_at+interval '${IDEAS.lapseHours} hours',${e}.created_at+interval '${IDEAS.lapseDays} days'))`;
/** SQL: an idea members can still say they are in on. */
export const openIdea=(e='e')=>`(${e}.state='idea' and ${e}.archived_at is null and not ${lapsedSql(e)})`;
/** What only an idea or a plan has. A fixed event has none of it. */
export type IdeaFacts={state:'idea'|'planned'|'cancelled'|'lapsed';
 /** How many people it needs, the proposer counted, and how many more it still needs. The event's `interested` is how many are in. */
 needed:number;needs:number;youProposed:boolean;
 /** While it has no start time: the days the proposer offered, and the day those who are in chose. */
 offeredDays:string[];day:string|null;
 /** The one ask Loop opened to settle the day, if it did. */
 dayAsk:{number:number;open:boolean}|null};
/** The open ideas that need exactly one more person, that `personId` is not in on and has not said are not for them: soonest first, at most 10. */
export async function oneShortFor(q:Q,team:Scope,personId:string):Promise<string[]> {
 const {rows}=await q.query<{id:string}>(`select e.id from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and ${openIdea()}
   and e.needed-(select count(*) from emba_event_interest i where i.event_id=e.id and ${posts('i.person_id')})=1
   and not exists(select 1 from emba_event_interest i where i.event_id=e.id and i.person_id=$3) and not exists(select 1 from emba_event_decline d where d.event_id=e.id and d.person_id=$3)
  order by e.starts_at asc nulls last,e.slug limit 10`,[team.orgId,team.loopId,personId]);
 return rows.map(row=>row.id);
}
/** Closes the ask Loop opened for an idea's day, if it is still open, and enters that in the change sequence. The caller holds the team's lock. */
export async function endDayAsk(q:Q,team:Scope,askId:string|null,actorId:string|null=null,clientId:string|null=null):Promise<void> {
 if(!askId)return;
 const {rows}=await q.query('update emba_ask set closed_at=clock_timestamp() where id=$1 and closed_at is null and closes_at>clock_timestamp() returning id',[askId]);
 if(rows.length)await logChange(q,team,'ask_closed',{askId},actorId,clientId);
}
const dayAskDue="k.org_id=$1 and k.loop_id=$2 and k.only_in and k.closed_at is null and k.closes_at<=clock_timestamp()";
/** True when an idea of the team ran out of time, or the ask for an idea's day passed its closing time, and the change sequence does not say so yet. */
export async function ideasDue(q:Q,team:Scope):Promise<boolean> {
 return (await q.query(`select 1 where exists(select 1 from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and e.archived_at is null and ${lapsedSql()}) or exists(select 1 from emba_ask k where ${dayAskDue})`,[team.orgId,team.loopId])).rows.length>0;
}
/** Thrown inside a read that found something past its time: the read is made again after the sweep. */
class Due extends Error {}
/**
 * A read of ideas that is right by the clock. If an idea has lapsed or a day
 * ask has run out and nothing has noted it yet, it is noted, under the team's
 * lock, and the read is made again. The caller's access is checked by the
 * read itself before anything is swept. If the team is busy the read is
 * returned as it stands and the next one sweeps.
 */
export async function settled<T>(db:Db,team:Scope,read:(check:(q:Q)=>Promise<void>)=>Promise<T>):Promise<T> {
 try{return await read(async q=>{if(await ideasDue(q,team))throw new Due();});}
 catch(error){if(!(error instanceof Due))throw error;}
 try{
  await db.tx(async q=>{
   await q.query("set local lock_timeout='2s'");
   const {rows}=await q.query('select 1 from emba_team_state where org_id=$1 and loop_id=$2 for update',[team.orgId,team.loopId]);
   if(rows.length)await lapseDue(q,team);
  });
 }catch(error){
  if(!['55P03','40P01','40001'].includes((error as {code?:string}).code??''))throw error;
 }
 return read(async()=>{});
}
/** The ask for an idea's day is over when every member who is in has answered it: it closes then, and the day is set. The caller holds the team's lock. */
export async function closeDayAskIfAnswered(q:Q,team:Scope,askId:string,eventId:string):Promise<void> {
 const {rows:[left]}=await q.query<{n:number;inAll:number}>(`select count(*) filter(where not exists(select 1 from emba_ask_answer a where a.ask_id=$4 and a.person_id=i.person_id))::int as n,count(*)::int as "inAll"
  from emba_event_interest i where i.event_id=$3 and ${posts('i.person_id')}`,[team.orgId,team.loopId,eventId,askId]);
 if(left.n||!left.inAll)return;
 const {rows}=await q.query('update emba_ask set closed_at=clock_timestamp() where id=$1 and closed_at is null and closes_at>clock_timestamp() returning id',[askId]);
 if(!rows.length)return;
 await logChange(q,team,'ask_closed',{askId},null,null);
 await resolveDay(q,team,askId);
}
/**
 * Notes each idea that ran out of time as lapsed: it leaves the lists, frees
 * its tag and stays in the team's history. Nothing is decided here: such an
 * idea is lapsed by the clock whether or not this has run. The caller holds
 * the team's lock.
 */
export async function lapseDue(q:Q,team:Scope):Promise<void> {
 // First the asks for a day that ran out their time: each is noted as closed by Loop, and its day is set.
 const {rows:asks}=await q.query<{id:string}>(`update emba_ask k set closed_at=k.closes_at where ${dayAskDue} returning k.id`,[team.orgId,team.loopId]);
 for(const ask of asks){
  await logChange(q,team,'ask_closed',{askId:ask.id},null,null);
  await resolveDay(q,team,ask.id);
 }
 const {rows}=await q.query<{id:string;askId:string|null}>(`update emba_team_event e set state='lapsed',archived_at=clock_timestamp() where e.org_id=$1 and e.loop_id=$2 and e.archived_at is null and ${lapsedSql()} returning e.id,e.day_ask_id as "askId"`,[team.orgId,team.loopId]);
 for(const row of rows){
  await logChange(q,team,'event_lapsed',{eventId:row.id},null,null);
  await endDayAsk(q,team,row.askId);
 }
}
/**
 * The ask for an idea's day has closed: the day with the most answers from
 * the members who are in becomes the idea's day. On a tie, or with no answer,
 * nothing is set and the proposer chooses. The caller holds the team's lock.
 */
export async function resolveDay(q:Q,team:Scope,askId:string):Promise<void> {
 const {rows:[idea]}=await q.query<{id:string}>("select e.id from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and e.day_ask_id=$3 and e.state='idea' and e.archived_at is null and e.starts_at is null and e.day is null for update",[team.orgId,team.loopId,askId]);
 if(!idea)return;
 const {rows:top}=await q.query<{label:string;n:number}>(`select o.label,(select count(*) from emba_ask_answer a where a.ask_id=o.ask_id and o.position=any(a.choices)
    and exists(select 1 from emba_event_interest i where i.event_id=$4 and i.person_id=a.person_id) and ${posts('a.person_id')})::int as n
  from emba_ask_option o where o.ask_id=$3 order by n desc,o.position limit 2`,[team.orgId,team.loopId,askId,idea.id]);
 // A day that has already passed settles nothing: the proposer chooses, as on a tie.
 if(top[0]?.n&&(top.length<2||top[0].n>top[1].n))await q.query(`update emba_team_event e set day=$2::date where e.id=$1
  and $2::date>=(clock_timestamp() at time zone coalesce((select s.timezone from emba_team_state s where s.org_id=e.org_id and s.loop_id=e.loop_id),'UTC'))::date`,[idea.id,top[0].label]);
}
// An event's words are shown inside assistant results, so each is one cleaned line.
const title=lineSchema(EVENTS.name);
// Left out means "leave as it is"; null means "clear it".
export const facts={startsAt:moment.nullish(),endsAt:moment.nullish(),place:lineSchema(EVENTS.place).nullish(),url:z.string().min(1).max(8000).nullish(),note:lineSchema(EVENTS.note).nullish()};

/** An event as members and their assistants see it: named by its tag, never by an id. */
export type EventView={slug:string;name:string;
 /** Instants, and the same moments written in the team's timezone. */
 startsAt:string|null;endsAt:string|null;starts:string|null;ends:string|null;timezone:string;
 place:string|null;url:string|null;note:string|null;archived:boolean;
 interested:number;youAreInterested:boolean;
 /** Only a dated event has a share link. It names the event and grants nothing. */
 shareUrl:string|null;
 /** Present on an idea or a plan only. */
 idea?:IdeaFacts};
/** The site's form of an event, with the id its manage controls need. */
export type TeamEvent=EventView&{id:string};
export type EventWrite=
 |{saved:true;event:EventView;changed:boolean}
 |Refused
 |{saved:false;reason:'cap';cap:'upcoming_events'}
 |{saved:false;reason:'name_taken'}
 |{saved:false;reason:'unknown_event';value:string}
 |{saved:false;reason:'archived'}
 |{saved:false;reason:'end_before_start'}
 |{saved:false;reason:'end_needs_start'}
 |{saved:false;reason:'link_refused';problem:LinkProblem};
type Declined=Exclude<EventWrite,{saved:true}>;
type Done={saved:true;event:EventView;changed:boolean;id:string};

/** SQL: a fixed event or a plan that is not archived and has not ended more than 12 hours ago. An event with no date does not end. An idea is not among them. */
export const upcoming=`e.archived_at is null and e.state in ('fixed','planned') and (e.starts_at is null or coalesce(e.ends_at,e.starts_at)>clock_timestamp()-interval '${EVENTS.graceHours} hours')`;
/** Events by id, in the order asked for. Interest counts current members only. */
export async function viewEvents(q:Q,p:Principal,timezone:string,ids:string[]):Promise<TeamEvent[]> {
 if(!ids.length)return [];
 type Extra={token:string;state:'fixed'|IdeaFacts['state'];needed:number|null;youProposed:boolean;offeredDays:string[];day:string|null;askNumber:number|null;askOpen:boolean|null};
 const {rows}=await q.query<Omit<TeamEvent,'shareUrl'|'timezone'|'idea'>&Extra>(`select e.id,e.slug,e.name,e.starts_at as "startsAt",e.ends_at as "endsAt",${local('e.starts_at','$3::text')} as starts,${local('e.ends_at','$3::text')} as ends,
   e.place,e.url,e.note,e.archived_at is not null as archived,e.share_token as token,
   case when ${lapsedSql()} then 'lapsed' else e.state end as state,e.needed::int as needed,coalesce(e.proposer_id=$2,false) as "youProposed",to_char(e.day,'YYYY-MM-DD') as day,
   array(select to_char(d,'YYYY-MM-DD') from unnest(e.offered_days) d order by d) as "offeredDays",k.number as "askNumber",(k.closed_at is null and k.closes_at>clock_timestamp()) as "askOpen",
   (select count(*) from emba_event_interest i where i.event_id=e.id and ${posts('i.person_id','e.org_id','e.loop_id')})::int as interested,
   exists(select 1 from emba_event_interest i where i.event_id=e.id and i.person_id=$2 and ${posts('i.person_id','e.org_id','e.loop_id')}) as "youAreInterested"
  from emba_team_event e left join emba_ask k on k.id=e.day_ask_id where e.id=any($1::uuid[])`,[ids,p.personId,timezone]);
 return ids.flatMap(id=>rows.filter(row=>row.id===id)).map(({token,state,needed,youProposed,offeredDays,day,askNumber,askOpen,...row})=>({...row,timezone,shareUrl:row.startsAt&&!row.archived?appUrl(`/e/${token}`):null,
  ...(state==='fixed'||needed===null?{}:{idea:{state,needed,needs:Math.max(0,needed-row.interested),youProposed,offeredDays,day,dayAsk:askNumber===null?null:{number:askNumber,open:Boolean(askOpen)}}})}));
}
/** The assistant-safe form: the same event without its id. */
export const bare=({id:_id,...event}:TeamEvent):EventView=>{void _id;return event;};
const open=(result:Done|Declined|Refused):EventWrite=>{
 if(!result.saved)return result;
 const {id:_id,...rest}=result;void _id;
 return rest;
};
const done=async(ctx:WriteCtx,id:string,changed:boolean):Promise<Done>=>({saved:true,changed,id,event:bare((await viewEvents(ctx.q,ctx.p,ctx.timezone,[id]))[0])});
export const link=(raw:string)=>{const found=normaliseLink(raw);return 'problem' in found?stop<Declined>({saved:false,reason:'link_refused',problem:found.problem}):found.url;};
/** Turns the stated start and end into instants in the team's timezone, and refuses an end that has no start or comes before it. */
export async function times(ctx:WriteCtx,startsAt:string|null,endsAt:string|null):Promise<{s:string|null;e:string|null}> {
 const {rows:[row]}=await ctx.q.query<{s:string|null;e:string|null}>(`select ${instant(1,3)} as s,${instant(2,3)} as e`,[startsAt,endsAt,ctx.timezone]);
 if(row.e&&!row.s)stop<Declined>({saved:false,reason:'end_needs_start'});
 if(row.s&&row.e&&Date.parse(row.e)<Date.parse(row.s))stop<Declined>({saved:false,reason:'end_before_start'});
 return row;
}
const nameFree=async(ctx:WriteCtx,slug:string)=>{
 // emba_team_name holds every handle, group and event name in the namespace; the database refuses a duplicate even if this check is raced.
 const {rows}=await ctx.q.query('select 1 from emba_team_name where org_id=$1 and name=$2',[ctx.team.orgId,slug]);
 if(rows.length)stop<Declined>({saved:false,reason:'name_taken'});
};

/** Refuses when the team already has 50 upcoming events. */
const room=async(ctx:WriteCtx)=>{
 const {rows:[live]}=await ctx.q.query<{n:number}>(`select count(*)::int as n from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and ${upcoming}`,[ctx.team.orgId,ctx.team.loopId]);
 if(live.n>=EVENTS.upcoming)stop<Declined>({saved:false,reason:'cap',cap:'upcoming_events'});
};

type Named={orgId:string;loopId?:string;eventId?:string;event?:string};
const named={orgId:z.uuid(),loopId:z.uuid().optional(),eventId:z.uuid().optional(),event:nameSchema.optional()};
type Target={team:Scope;id?:string;slug?:string};
/** Which team an event write is for. The site names an event by id, an assistant by team and tag. Unknown and unauthorized are the same answer. */
async function locate(db:Db,p:Principal,data:Named):Promise<Target> {
 if(data.eventId!==undefined){
  const {rows:[found]}=await db.query<{loopId:string}>('select loop_id as "loopId" from emba_team_event where org_id=$1 and id=$2',[data.orgId,data.eventId]);
  if(!found){await db.tx(q=>requireFirstParty(q,p));throw new EmbaError('forbidden');}
  return {team:{orgId:data.orgId,loopId:found.loopId},id:data.eventId};
 }
 if(data.loopId===undefined||data.event===undefined)throw new ZodError([]);
 return {team:{orgId:data.orgId,loopId:data.loopId},slug:data.event};
}
type Held={id:string;slug:string;name:string;startsAt:string|null;endsAt:string|null;place:string|null;url:string|null;note:string|null;archived:boolean;invites:boolean};
/** Locks the event inside the team. A tag names only an event that is not archived. An idea or a plan is not managed here: its proposer changes it as an idea. */
async function held(ctx:WriteCtx,target:Target):Promise<Held> {
 const {rows:[row]}=await ctx.q.query<Held>(`select id,slug,name,starts_at as "startsAt",ends_at as "endsAt",place,url,note,archived_at is not null as archived,invites_at is not null as invites from emba_team_event
  where org_id=$1 and loop_id=$2 and state='fixed' and (id=$3::uuid or ($3::uuid is null and slug=$4 and archived_at is null)) for update`,[ctx.team.orgId,ctx.team.loopId,target.id??null,target.slug??null]);
 if(!row){
  if(target.id)throw new EmbaError('forbidden');
  return stop<Declined>({saved:false,reason:'unknown_event',value:target.slug!});
 }
 return row;
}
const counted=(p:Principal)=>p.clientId!==null;

const addSchema=z.strictObject({...scope,slug:nameSchema,name:title,...facts});
async function add(db:Db,p:Principal,input:unknown):Promise<Done|Declined|Refused> {
 const data=addSchema.parse(input);
 return teamWrite<Done|Declined>(db,p,data,{need:'manage',lock:true,count:counted(p),taken:{saved:false,reason:'name_taken'}},async ctx=>{
  const url=data.url?link(data.url):null;
  await room(ctx);
  await nameFree(ctx,data.slug);
  const when=await times(ctx,data.startsAt??null,data.endsAt??null);
  const {rows:[row]}=await ctx.q.query<{id:string}>('insert into emba_team_event(org_id,loop_id,slug,name,created_by,starts_at,ends_at,place,url,note) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id',
   [data.orgId,data.loopId,data.slug,data.name,p.personId,when.s,when.e,data.place??null,url,data.note??null]);
  await ctx.log('event_added',{eventId:row.id});
  return done(ctx,row.id,true);
 });
}
const changeSchema=z.strictObject({...named,slug:nameSchema.optional(),name:title.optional(),...facts});
async function change(db:Db,p:Principal,input:unknown):Promise<Done|Declined|Refused> {
 const data=changeSchema.parse(input),target=await locate(db,p,data);
 return teamWrite<Done|Declined>(db,p,target.team,{need:'manage',lock:true,count:counted(p),taken:{saved:false,reason:'name_taken'}},async ctx=>{
  const row=await held(ctx,target);
  // An archived event is restored first; it holds no name to change.
  if(row.archived)stop<Declined>({saved:false,reason:'archived'});
  const url=data.url===undefined?row.url:data.url===null?null:link(data.url);
  const slug=data.slug??row.slug;
  if(slug!==row.slug)await nameFree(ctx,slug);
  const when=await times(ctx,data.startsAt===undefined?row.startsAt:data.startsAt,data.endsAt===undefined?row.endsAt:data.endsAt);
  const next={slug,name:data.name??row.name,startsAt:when.s,endsAt:when.e,place:data.place===undefined?row.place:data.place,url,note:data.note===undefined?row.note:data.note};
  const same=(key:keyof typeof next)=>key==='startsAt'||key==='endsAt'?(next[key]===null?row[key]===null:row[key]!==null&&Date.parse(next[key]!)===Date.parse(row[key]!)):next[key]===row[key];
  const changed=(Object.keys(next) as (keyof typeof next)[]).filter(key=>!same(key));
  if(!changed.length)return done(ctx,row.id,false);
  await ctx.q.query('update emba_team_event set slug=$2,name=$3,starts_at=$4,ends_at=$5,place=$6,url=$7,note=$8 where id=$1',[row.id,next.slug,next.name,next.startsAt,next.endsAt,next.place,next.url,next.note]);
  // What is new reports a change of time or place. A new name or note is seen on the event itself.
  if(changed.some(key=>key==='startsAt'||key==='endsAt'||key==='place')){
   await ctx.log('event_changed',{eventId:row.id});
   // An event that was sent as an invite moves in the calendars it is in, and leaves them if it lost its date.
   if(row.invites)await (next.startsAt?inviteAll:cancelAll)(ctx.q,ctx.team,row.id);
  }
  return done(ctx,row.id,true);
 });
}
async function archive(db:Db,p:Principal,input:unknown):Promise<Done|Declined|Refused> {
 const data=z.strictObject(named).parse(input),target=await locate(db,p,data);
 // A retired team's events can still be archived.
 return teamWrite<Done|Declined>(db,p,target.team,{need:'manage',lock:true,retired:true,count:counted(p)},async ctx=>{
  const row=await held(ctx,target);
  if(row.archived)return done(ctx,row.id,false);
  await ctx.q.query('update emba_team_event set archived_at=clock_timestamp() where id=$1',[row.id]);
  await ctx.log('event_archived',{eventId:row.id});
  if(row.invites)await cancelAll(ctx.q,ctx.team,row.id);
  return done(ctx,row.id,true);
 });
}

/** Adds an event. Owners and organizers, on the site or through an assistant with a read-and-write grant. */
export const addEvent=async(db:Db,p:Principal,input:unknown):Promise<EventWrite>=>open(await add(db,p,input));
/** Changes an event's tag, name, date, end, place, link or note. Fields left out stay as they are; null clears one. */
export const changeEvent=async(db:Db,p:Principal,input:unknown):Promise<EventWrite>=>open(await change(db,p,input));
/** Archives an event: it takes no new records and leaves the upcoming list. An owner or organizer can restore it on the site. */
export const archiveEvent=async(db:Db,p:Principal,input:unknown):Promise<EventWrite>=>open(await archive(db,p,input));
/** Site only: brings an archived event back, if its tag is still free. */
export async function restoreEvent(db:Db,p:Principal,input:unknown):Promise<EventWrite> {
 const data=z.strictObject({orgId:z.uuid(),eventId:z.uuid()}).parse(input),target=await locate(db,p,data);
 return open(await teamWrite<Done|Declined>(db,p,target.team,{need:'manage',lock:true,siteOnly:true,taken:{saved:false,reason:'name_taken'}},async ctx=>{
  const row=await held(ctx,target);
  if(!row.archived)return done(ctx,row.id,false);
  await room(ctx);
  await nameFree(ctx,row.slug);
  await ctx.q.query('update emba_team_event set archived_at=null where id=$1',[row.id]);
  await ctx.log('event_restored',{eventId:row.id});
  // It was sent as an invite and archiving took it out of calendars: it goes back.
  if(row.invites&&row.startsAt)await inviteAll(ctx.q,ctx.team,row.id);
  return done(ctx,row.id,true);
 }));
}

// The earlier forms, kept for the site's forms: they return the event or throw.
const strict=(result:Done|Declined|Refused):Done=>{
 if(result.saved)return result;
 if(result.reason==='organizers_only'||result.reason==='members_only')throw new EmbaError('forbidden');
 if(result.reason==='busy')throw new EmbaError('unavailable');
 if(result.reason==='end_before_start'||result.reason==='end_needs_start'||result.reason==='link_refused')throw new ZodError([]);
 throw new EmbaError('conflict');
};
export async function createTeamEvent(db:Db,p:Principal,input:unknown):Promise<TeamEvent> {
 const result=strict(await add(db,p,input));
 return {id:result.id,...result.event};
}
export async function renameTeamEvent(db:Db,p:Principal,input:unknown):Promise<void> {
 strict(await change(db,p,z.strictObject({orgId:z.uuid(),eventId:z.uuid(),slug:nameSchema,name:title}).parse(input)));
}
export async function archiveTeamEvent(db:Db,p:Principal,input:unknown):Promise<void> {
 strict(await archive(db,p,z.strictObject({orgId:z.uuid(),eventId:z.uuid()}).parse(input)));
}
/** Site listing for a team's members, with the ids the manage controls need. Archived events are listed for owners and organizers only. */
export async function listTeamEvents(db:Db,p:Principal,input:unknown):Promise<TeamEvent[]> {
 const data=z.strictObject({...scope,archived:z.boolean().default(false)}).parse(input);
 return db.tx(async q=>{
  await requireFirstParty(q,p);
  if(!await canAccessLoop(q,p,data.orgId,data.loopId,data.archived?'manage':'read'))throw new EmbaError('forbidden');
  const {rows:[state]}=await q.query<{timezone:string}>('select timezone from emba_team_state where org_id=$1 and loop_id=$2',[data.orgId,data.loopId]);
  const {rows}=await q.query<{id:string}>("select id from emba_team_event where org_id=$1 and loop_id=$2 and state='fixed' and (archived_at is not null)=$3 order by slug limit 200",[data.orgId,data.loopId,data.archived]);
  return viewEvents(q,p,state?.timezone??'UTC',rows.map(row=>row.id));
 });
}
