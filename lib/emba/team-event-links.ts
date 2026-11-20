import 'server-only';
import {z} from 'zod';
import type {Db} from '../db';
import type {Principal} from './access';
import {eventLink,readEventPage,type PageFacts,type PageReader} from './event-link';
import {slugOf} from './start-sort';
import {cancelAll} from './team-calendar';
import {moment,posts,scope,stop,teamWrite,type Refused,type WriteCtx} from './team-core';
import {bare,EVENTS,followSource,room,times,upcoming,viewEvents,type EventView} from './team-events';
import {arrival,card,route,setInterest} from './team-interest';
import type {LinkProblem} from './team-link';
import {lineSchema,nameSchema} from './team-text';

// Adding an event by link, or from the nearby list (design D2, D5, D7, D8 of
// loop-group-event-links). Any member who can post does this; nothing is
// approved. The page is read between two writes, never inside one: the first
// checks the caller and whether the group already holds the link, the second
// saves. Changing and archiving an event stay with owners and organizers.

export const LINKS={perMember:10} as const;
export type LinkWrite=
 |{saved:true;event:EventView;changed:boolean;
  /** The group already held this event: the caller was marked interested in it and nothing was added. */
  existing:boolean}
 |Refused
 |{saved:false;reason:'cap';cap:'upcoming_events'|'linked_events'}
 // Loopd could not read the page: nothing is saved until the member gives a name and a start. `listed` says whether it is a site Loopd reads at all.
 |{saved:false;reason:'needs_facts';listed:boolean}
 |{saved:false;reason:'link_refused';problem:LinkProblem}
 |{saved:false;reason:'end_before_start'}
 |{saved:false;reason:'end_needs_start'}
 |{saved:false;reason:'unknown_nearby';value:string}
 |{saved:false;reason:'unknown_event';value:string};
type Declined=Exclude<LinkWrite,{saved:true}|Refused>;
/** Not an answer to the caller: the group already holds the event under this tag. */
type Held={saved:false;reason:'held';slug:string};
type None={saved:false;reason:'none'};

export const nearbyCode=z.string().regex(/^[0-9a-f]{8}$/);
const linkSchema=z.strictObject({...scope,url:z.string().min(1).max(8000).optional(),nearby:nearbyCode.optional(),
 // Used only when Loopd cannot read the page.
 name:lineSchema(EVENTS.name).optional(),startsAt:moment.optional(),endsAt:moment.nullish(),place:lineSchema(EVENTS.place).nullish(),route,card})
 .refine(data=>(data.url===undefined)!==(data.nearby===undefined));

/** Two names are the same when their letters and digits are, whatever the case, spacing or punctuation (design D8). */
export const nameKey=(name:string)=>name.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const heldLink=async(ctx:WriteCtx,url:string):Promise<string|null>=>
 (await ctx.q.query<{slug:string}>('select slug from emba_team_event where org_id=$1 and loop_id=$2 and url=$3 and archived_at is null order by created_at limit 1',[ctx.team.orgId,ctx.team.loopId,url])).rows[0]?.slug??null;
/** A tag made from the name, with a number after it when the tag is taken. */
async function freeTag(ctx:WriteCtx,name:string):Promise<string> {
 const made=slugOf(name).slice(0,44).replace(/-+$/,''),base=nameSchema.safeParse(made).success?made:'event';
 const {rows}=await ctx.q.query<{name:string}>("select name from emba_team_name where org_id=$1 and (name=$2 or name like $2||'-%')",[ctx.team.orgId,base]);
 const taken=new Set(rows.map(row=>row.name));
 for(let n=1;n<=99;n++){const tag=n===1?base:`${base}-${n}`;if(!taken.has(tag))return tag;}
 return stop<Refused>({saved:false,reason:'busy'});
}

/**
 * Adds an event to the team from a link, or from an item of its nearby list,
 * and marks the caller interested. A link the team already holds, or an event
 * with the same name and start, adds nothing: the caller is marked interested
 * in the one that exists. `read` fetches the page; it is called only for a
 * site Loopd reads, and only after the caller is known to be allowed to post.
 */
export async function linkEvent(db:Db,p:Principal,input:unknown,read:PageReader=readEventPage):Promise<LinkWrite> {
 const data=linkSchema.parse(input),team={orgId:data.orgId,loopId:data.loopId};
 const link=data.url===undefined?null:eventLink(data.url);
 if(link&&'problem' in link)return {saved:false,reason:'link_refused',problem:link.problem};
 const join=async(slug:string):Promise<LinkWrite>=>{
  const marked=await setInterest(db,p,{...team,event:slug,interested:true,route:data.route,card:data.card});
  return marked.saved?{saved:true,event:marked.event,changed:marked.changed,existing:true}:marked;
 };
 let facts:PageFacts|null=null,follow=false;
 if(link){
  const first=await teamWrite<Held|None>(db,p,team,{need:'post'},async ctx=>{
   const slug=await heldLink(ctx,link.url);
   return slug?{saved:false,reason:'held',slug}:{saved:false,reason:'none'};
  });
  if(first.reason==='held')return join(first.slug);
  if(first.reason!=='none')return first;
  if(link.listed){
   const page=await read(link.url);
   if(page.ok){facts=page.facts;follow=true;}
  }
  if(!facts){
   if(data.name===undefined||data.startsAt===undefined)return {saved:false,reason:'needs_facts',listed:link.listed};
   facts={name:data.name,startsAt:data.startsAt,endsAt:data.endsAt??null,place:data.place??null,host:null};
  }
 }
 const result=await teamWrite<Extract<LinkWrite,{saved:true}>|Declined|Held>(db,p,team,{need:'post',lock:true,count:p.clientId!==null},async ctx=>{
  const held=(slug:string):Held=>({saved:false,reason:'held',slug});
  let from=facts,itemId:string|null=null;
  if(data.nearby!==undefined){
   const {rows:[item]}=await ctx.q.query<{id:string;name:string;startsAt:string;endsAt:string|null;place:string|null;host:string|null;taken:boolean;slug:string|null}>(`select n.id,n.title as name,n.starts_at as "startsAt",n.ends_at as "endsAt",n.place,n.host,
     n.event_id is not null as taken,(select e.slug from emba_team_event e where e.id=n.event_id and e.archived_at is null) as slug
    from emba_team_nearby n join emba_team_feed f on f.id=n.feed_id
    where n.org_id=$1 and n.loop_id=$2 and n.code=$3 and (n.event_id is not null or (n.left_feed_at is null and f.is_on)) for update of n`,[team.orgId,team.loopId,data.nearby]);
   if(!item||(item.taken&&!item.slug))return stop<Declined>({saved:false,reason:'unknown_nearby',value:data.nearby});
   // Another member was first: the item is already the group's event.
   if(item.slug)return held(item.slug);
   from={name:item.name,startsAt:item.startsAt,endsAt:item.endsAt,place:item.place,host:item.host};itemId=item.id;follow=true;
  }
  if(!from)throw new Error('No facts to save');
  // The same link, saved a moment ago by someone else.
  const again=link?await heldLink(ctx,link.url):null;
  if(again)return held(again);
  const when=await times(ctx,from.startsAt,from.endsAt),key=nameKey(from.name);
  // The same event from another source (design D8): same start, same name. The group keeps one.
  const {rows:items}=await ctx.q.query<{id:string;title:string}>('select id,title from emba_team_nearby where org_id=$1 and loop_id=$2 and starts_at=$3 and event_id is null',[team.orgId,team.loopId,when.s]);
  const twins=items.filter(item=>item.id===itemId||nameKey(item.title)===key).map(item=>item.id);
  const {rows:events}=await ctx.q.query<{id:string;slug:string;name:string}>(`select e.id,e.slug,e.name from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and e.starts_at=$3 and ${upcoming}`,[team.orgId,team.loopId,when.s]);
  const same=events.find(event=>nameKey(event.name)===key);
  if(same){
   if(twins.length)await ctx.q.query('update emba_team_nearby set event_id=$2 where id=any($1::uuid[])',[twins,same.id]);
   return held(same.slug);
  }
  await room(ctx);
  const {rows:[mine]}=await ctx.q.query<{n:number}>(`select count(*)::int as n from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and e.created_by=$3 and e.source is not null and ${upcoming}`,[team.orgId,team.loopId,p.personId]);
  if(mine.n>=LINKS.perMember)stop<Declined>({saved:false,reason:'cap',cap:'linked_events'});
  const tag=await freeTag(ctx,from.name);
  const {rows:[row]}=await ctx.q.query<{id:string}>(`insert into emba_team_event(org_id,loop_id,slug,name,created_by,starts_at,ends_at,place,url,note,source,source_follow,source_read_at)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp()) returning id`,
   [team.orgId,team.loopId,tag,from.name,p.personId,when.s,when.e,from.place,link?.url??null,from.host?`Hosted by ${from.host}`:null,link?'link':'feed',follow]);
  const how=arrival(p,data.route,data.card);
  await ctx.q.query('insert into emba_event_interest(event_id,org_id,loop_id,person_id,route,client_id) values($1,$2,$3,$4,$5,$6)',[row.id,team.orgId,team.loopId,p.personId,how.route,how.clientId]);
  await ctx.log('event_added',{eventId:row.id});
  if(twins.length)await ctx.q.query('update emba_team_nearby set event_id=$2 where id=any($1::uuid[])',[twins,row.id]);
  return {saved:true,changed:true,existing:false,event:bare((await viewEvents(ctx.q,ctx.p,ctx.timezone,[row.id]))[0])};
 });
 return !result.saved&&result.reason==='held'?join(result.slug):result;
}

export type UnlinkWrite=
 |{saved:true;event:EventView}
 |Refused
 |{saved:false;reason:'unknown_event';value:string}
 // Only the member who added it by link or from nearby takes it back.
 |{saved:false;reason:'not_yours'}
 |{saved:false;reason:'others_interested'};
/**
 * The member who added an event by link or from nearby takes it back, while
 * no other member is interested in it (design D5). It is archived like any
 * event; the link can be added again, and a nearby item returns to its list.
 */
export async function unlinkEvent(db:Db,p:Principal,input:unknown):Promise<UnlinkWrite> {
 const data=z.strictObject({...scope,event:nameSchema}).parse(input),team={orgId:data.orgId,loopId:data.loopId};
 type No=Exclude<UnlinkWrite,{saved:true}|Refused>;
 return teamWrite<Exclude<UnlinkWrite,Refused>>(db,p,team,{need:'post',lock:true,count:p.clientId!==null},async ctx=>{
  const {rows:[row]}=await ctx.q.query<{id:string;mine:boolean;invites:boolean}>(`select id,(source is not null and coalesce(created_by=$4,false)) as mine,invites_at is not null as invites from emba_team_event
   where org_id=$1 and loop_id=$2 and slug=$3 and archived_at is null and state='fixed' for update`,[team.orgId,team.loopId,data.event,p.personId]);
  if(!row)return stop<No>({saved:false,reason:'unknown_event',value:data.event});
  if(!row.mine)return stop<No>({saved:false,reason:'not_yours'});
  const {rows:others}=await ctx.q.query(`select 1 from emba_event_interest i where i.event_id=$3 and i.person_id<>$4 and ${posts('i.person_id')} limit 1`,[team.orgId,team.loopId,row.id,p.personId]);
  if(others.length)return stop<No>({saved:false,reason:'others_interested'});
  await ctx.q.query('update emba_team_event set archived_at=clock_timestamp() where id=$1',[row.id]);
  await ctx.log('event_archived',{eventId:row.id});
  if(row.invites)await cancelAll(ctx.q,ctx.team,row.id);
  await ctx.q.query('update emba_team_nearby set event_id=null where event_id=$1',[row.id]);
  return {saved:true,event:bare((await viewEvents(ctx.q,ctx.p,ctx.timezone,[row.id]))[0])};
 });
}

export const REREAD={most:200} as const;
/**
 * The daily read (design D6): every upcoming event that follows a link is
 * read again, the one read longest ago first, at most 200 a run. A changed
 * start, end or place is applied as Loopd's own change. A page that is gone,
 * or says the event is cancelled, labels the event. A page that cannot be
 * read changes nothing. One event that fails does not stop the others.
 */
export async function rereadLinkedEvents(db:Db,read:PageReader=readEventPage):Promise<{read:number;changed:number;gone:number}> {
 const {rows}=await db.query<{id:string;orgId:string;loopId:string;url:string}>(`select e.id,e.org_id as "orgId",e.loop_id as "loopId",e.url from emba_team_event e
  where e.source='link' and e.source_follow and e.archived_at is null and e.state='fixed' and coalesce(e.ends_at,e.starts_at)>clock_timestamp()
  order by e.source_read_at asc nulls first,e.id limit ${REREAD.most}`);
 let changed=0,gone=0;
 for(const row of rows){
  try{
   const page=await read(row.url);
   if(!page.ok&&page.reason!=='gone'){
    await db.query('update emba_team_event set source_read_at=clock_timestamp() where id=$1',[row.id]);
    continue;
   }
   const team={orgId:row.orgId,loopId:row.loopId};
   const moved=await db.tx(async q=>{
    await q.query("set local lock_timeout='2s'");
    await q.query('select 1 from emba_team_state where org_id=$1 and loop_id=$2 for update',[team.orgId,team.loopId]);
    return followSource(q,team,row.id,page.ok?{startsAt:page.facts.startsAt,endsAt:page.facts.endsAt,place:page.facts.place}:'gone');
   });
   if(moved)changed++;
   if(!page.ok)gone++;
  }catch{
   // The team was busy, or this one event could not be saved: the next run reads it again.
  }
 }
 return {read:rows.length,changed,gone};
}
