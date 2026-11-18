import 'server-only';
import {z} from 'zod';
import {parseFeed} from '../campus/import';
import type {Db,Q} from '../db';
import {guardedFetch,type GuardDeps} from '../guarded-fetch';
import type {Principal} from './access';
import {cut} from './event-link';
import {local,reading,scope,stop,teamWrite,type Refused,type Scope,type TeamHead} from './team-core';
import {nameKey} from './team-event-links';
import {followSource,upcoming} from './team-events';
import {normaliseLink,type LinkProblem} from './team-link';
import {lineSchema} from './team-text';

// Nearby (design D7, D9 of loop-group-event-links). An owner or organizer
// gives the group calendar feeds, on the site only: an assistant never names
// an address Loop fetches. Each feed that is on is read every hour; what it
// holds in the next 14 days is the group's Nearby list. A nearby item is not
// a group event: it enters no change sequence, waits for nobody and counts
// toward no limit. The first member interested makes it one (team-event-links).

export const NEARBY={feeds:10,days:14,list:30,title:80,place:120,host:120} as const;
export type FeedView={id:string;name:string;url:string;on:boolean;lastReadAt:string|null;lastOk:boolean|null;lastResult:string|null};
export type FeedWrite=
 |{saved:true;feed:FeedView|null}
 |Refused
 |{saved:false;reason:'cap';cap:'feeds'}
 |{saved:false;reason:'link_refused';problem:LinkProblem}
 |{saved:false;reason:'feed_exists'}
 |{saved:false;reason:'unknown_feed'};
type No=Exclude<FeedWrite,{saved:true}|Refused>;
const feedColumns='id,name,url,is_on as "on",last_read_at as "lastReadAt",last_ok as "lastOk",last_result as "lastResult"';
const oneFeed=async(q:Q,team:Scope,id:string)=>(await q.query<FeedView>(`select ${feedColumns} from emba_team_feed where org_id=$1 and loop_id=$2 and id=$3`,[team.orgId,team.loopId,id])).rows[0]??null;
// Owners and organizers, on the site. The team's lock makes two of them go one after the other.
const managing={need:'manage',siteOnly:true,lock:true} as const;

/** Adds a calendar feed to the team and reads it at once. A `webcal:` address is the same https address. */
export async function addFeed(db:Db,p:Principal,input:unknown,deps:GuardDeps={}):Promise<FeedWrite> {
 const data=z.strictObject({...scope,name:lineSchema(NEARBY.title),url:z.string().min(1).max(8000)}).parse(input),team={orgId:data.orgId,loopId:data.loopId};
 const link=normaliseLink(data.url.trim().replace(/^webcal:/i,'https:'));
 if('problem' in link)return {saved:false,reason:'link_refused',problem:link.problem};
 const added=await teamWrite<{saved:true;feed:FeedView|null;id:string}|No>(db,p,team,managing,async ctx=>{
  const {rows}=await ctx.q.query<{slot:number;url:string}>('select slot,url from emba_team_feed where org_id=$1 and loop_id=$2',[team.orgId,team.loopId]);
  if(rows.some(row=>row.url===link.url))return stop<No>({saved:false,reason:'feed_exists'});
  const slot=Array.from({length:NEARBY.feeds},(_,n)=>n+1).find(n=>!rows.some(row=>row.slot===n));
  if(!slot)return stop<No>({saved:false,reason:'cap',cap:'feeds'});
  const {rows:[row]}=await ctx.q.query<{id:string}>('insert into emba_team_feed(org_id,loop_id,slot,name,url,added_by) values($1,$2,$3,$4,$5,$6) returning id',[team.orgId,team.loopId,slot,data.name,link.url,p.personId]);
  return {saved:true,feed:null,id:row.id};
 });
 if(!added.saved)return added;
 await readTeamFeeds(db,{...deps,feedId:added.id});
 return {saved:true,feed:await oneFeed(db,team,added.id)};
}
const feedTarget=z.strictObject({...scope,feedId:z.uuid()});
/** Turns a feed off or on. Off stops its reads and takes its items out of the Nearby list; group events made from it are kept. */
export async function setFeedOn(db:Db,p:Principal,input:unknown):Promise<FeedWrite> {
 const data=feedTarget.extend({on:z.boolean()}).parse(input),team={orgId:data.orgId,loopId:data.loopId};
 return teamWrite<Exclude<FeedWrite,Refused>>(db,p,team,managing,async ctx=>{
  const {rows}=await ctx.q.query('update emba_team_feed set is_on=$4 where org_id=$1 and loop_id=$2 and id=$3 returning id',[team.orgId,team.loopId,data.feedId,data.on]);
  if(!rows.length)return stop<No>({saved:false,reason:'unknown_feed'});
  return {saved:true,feed:await oneFeed(ctx.q,team,data.feedId)};
 });
}
/** Removes a feed and its nearby items. Group events made from it are kept as they are and no longer follow it. */
export async function removeFeed(db:Db,p:Principal,input:unknown):Promise<FeedWrite> {
 const data=feedTarget.parse(input),team={orgId:data.orgId,loopId:data.loopId};
 return teamWrite<Exclude<FeedWrite,Refused>>(db,p,team,managing,async ctx=>{
  await ctx.q.query("update emba_team_event e set source_follow=false where e.source='feed' and e.id in (select n.event_id from emba_team_nearby n where n.org_id=$1 and n.loop_id=$2 and n.feed_id=$3)",[team.orgId,team.loopId,data.feedId]);
  const {rows}=await ctx.q.query('delete from emba_team_feed where org_id=$1 and loop_id=$2 and id=$3 returning id',[team.orgId,team.loopId,data.feedId]);
  if(!rows.length)return stop<No>({saved:false,reason:'unknown_feed'});
  return {saved:true,feed:null};
 });
}
/** "Read now": reads one feed at once and answers with its result. */
export async function readFeedNow(db:Db,p:Principal,input:unknown,deps:GuardDeps={}):Promise<FeedWrite> {
 const data=feedTarget.parse(input),team={orgId:data.orgId,loopId:data.loopId};
 const found=await teamWrite<Exclude<FeedWrite,Refused>>(db,p,team,{need:'manage',siteOnly:true},async ctx=>{
  const feed=await oneFeed(ctx.q,team,data.feedId);
  return feed?{saved:true,feed}:stop<No>({saved:false,reason:'unknown_feed'});
 });
 if(!found.saved)return found;
 await readTeamFeeds(db,{...deps,feedId:data.feedId});
 return {saved:true,feed:await oneFeed(db,team,data.feedId)};
}
/** The team's feeds with their last result, for owners and organizers on the site. Anyone else gets none. */
export async function teamFeeds(db:Db,p:Principal,input:unknown):Promise<FeedView[]> {
 const team=z.strictObject(scope).parse(input);
 const listed=await teamWrite<{saved:false;reason:'feeds';feeds:FeedView[]}>(db,p,team,{need:'manage',siteOnly:true},async ctx=>
  ({saved:false,reason:'feeds',feeds:(await ctx.q.query<FeedView>(`select ${feedColumns} from emba_team_feed where org_id=$1 and loop_id=$2 order by slot`,[team.orgId,team.loopId])).rows}));
 return listed.reason==='feeds'?listed.feeds:[];
}

/**
 * Reads every feed that is on, or the one named. An item in the next 14 days
 * becomes a nearby item, matched by feed and item id; a changed item updates
 * it; an item that is gone or cancelled leaves the list. An item that became
 * a group event carries its changes to that event, and labels it when it
 * goes. A feed that fails keeps its items, has the failure recorded on it in
 * Loop's own words, and does not stop the others.
 */
export async function readTeamFeeds(db:Db,options:GuardDeps&{now?:Date;feedId?:string}={}):Promise<{feeds:number;failed:number}> {
 const {now=new Date(),feedId,...deps}=options;
 const {rows:feeds}=await db.query<Scope&{id:string;url:string;tz:string}>(`select f.id,f.org_id as "orgId",f.loop_id as "loopId",f.url,coalesce(s.timezone,'UTC') as tz
  from emba_team_feed f left join emba_team_state s on s.org_id=f.org_id and s.loop_id=f.loop_id where ${feedId?'f.id=$1':'f.is_on'} order by f.created_at,f.id`,feedId?[feedId]:[]);
 let failed=0;
 for(const feed of feeds){
  let result:string,fine=false;
  try{
   const got=await guardedFetch(feed.url,{mode:'feed'},{...deps,accept:'text/calendar'});
   if(!got.ok)result='The feed could not be read';
   else{
    let items:ReturnType<typeof parseFeed>|null=null;
    try{items=parseFeed(got.text,feed.tz);}catch{}
    if(!items)result='This is not a calendar feed';
    else{
     const soon=await db.tx(q=>sync(q,feed,items,now));
     result=`Read ${items.length} ${items.length===1?'event':'events'}, ${soon} in the next ${NEARBY.days} days`;fine=true;
    }
   }
  }catch{result='The feed could not be read';}
  if(!fine)failed++;
  await db.query('update emba_team_feed set last_read_at=$2,last_ok=$3,last_result=$4 where id=$1',[feed.id,now.toISOString(),fine,result]).catch(()=>{});
 }
 return {feeds:feeds.length,failed};
}
async function sync(q:Q,feed:Scope&{id:string},items:ReturnType<typeof parseFeed>,now:Date):Promise<number> {
 const team={orgId:feed.orgId,loopId:feed.loopId},at=now.toISOString();
 // The team's lock first, as every write to its events takes it; then the feed, so the hourly read and "Read now" go one after the other.
 await q.query("set local lock_timeout='5s'");
 await q.query('insert into emba_team_state(org_id,loop_id) values($1,$2) on conflict do nothing',[team.orgId,team.loopId]);
 await q.query('select 1 from emba_team_state where org_id=$1 and loop_id=$2 for update',[team.orgId,team.loopId]);
 await q.query('select id from emba_team_feed where id=$1 for update',[feed.id]);
 // What ended more than two days ago is dropped, so an hour's work does not grow with the feed's history.
 await q.query("delete from emba_team_nearby where feed_id=$1 and coalesce(ends_at,starts_at)<$2::timestamptz-interval '2 days'",[feed.id,at]);
 const {rows}=await q.query<{id:string;item:string;left:boolean;over:boolean;follows:string|null}>(`select n.id,n.item_id as item,n.left_feed_at is not null as left,coalesce(n.ends_at,n.starts_at)<$2::timestamptz as over,
   (select e.id from emba_team_event e where e.id=n.event_id and e.source='feed') as follows from emba_team_nearby n where n.feed_id=$1`,[feed.id,at]);
 const known=new Map(rows.map(row=>[row.item,row])),seen=new Set<string>();
 let soon=0;
 for(const item of items){
  const title=cut(item.title,NEARBY.title);
  if(item.cancelled||seen.has(item.id)||!title||!/[\p{L}\p{N}]/u.test(title))continue;
  const start=Date.parse(item.startsAt),wanted=Date.parse(item.endsAt??item.startsAt)>=now.getTime()&&start<now.getTime()+NEARBY.days*86400000;
  const row=known.get(item.id),place=cut(item.place,NEARBY.place),host=cut(item.host,NEARBY.host);
  if(wanted)soon++;
  if(row){
   await q.query('update emba_team_nearby set title=$2,starts_at=$3,ends_at=$4,place=$5,host=$6,left_feed_at=null where id=$1',[row.id,title,item.startsAt,item.endsAt,place,host]);
   // An item that became a group event carries its changes to it (design D7).
   if(row.follows)await followSource(q,team,row.follows,{startsAt:item.startsAt,endsAt:item.endsAt,place});
  }else if(wanted){
   // The same event a member already added (design D8) is not listed a second time: the item is held against that event.
   const {rows:events}=await q.query<{id:string;name:string}>(`select e.id,e.name from emba_team_event e where e.org_id=$1 and e.loop_id=$2 and e.starts_at=$3 and ${upcoming}`,[team.orgId,team.loopId,item.startsAt]);
   const same=events.find(event=>nameKey(event.name)===nameKey(title));
   await q.query('insert into emba_team_nearby(org_id,loop_id,feed_id,item_id,title,starts_at,ends_at,place,host,event_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[team.orgId,team.loopId,feed.id,item.id,title,item.startsAt,item.endsAt,place,host,same?.id??null]);
  }else continue;
  seen.add(item.id);
 }
 // Gone from the feed, or cancelled there: it leaves the list. A group event made from it is labelled and kept.
 for(const row of rows.filter(row=>!row.left&&!seen.has(row.item))){
  await q.query('update emba_team_nearby set left_feed_at=$2 where id=$1',[row.id,at]);
  if(row.follows&&!row.over)await followSource(q,team,row.follows,'gone');
 }
 return soon;
}

/** A nearby item as members and their assistants see it: named by its code, never by an id. */
export type NearbyItem={code:string;title:string;startsAt:string;endsAt:string|null;starts:string;ends:string|null;place:string|null;host:string|null;
 /** The name an owner or organizer gave the feed it came from. */
 feed:string};
export type Nearby={team:TeamHead;timezone:string;today:string;items:NearbyItem[];untrusted:true};
/** The soonest 30 nearby items that have not ended, for members and followers of the team. With a day, only what starts that day in the team's timezone. */
export async function nearby(db:Db,p:Principal,input:unknown):Promise<Nearby> {
 const {day,...team}=z.strictObject({...scope,day:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).optional()}).parse(input);
 return reading(db,p,team,async({q,...base})=>{
  const {rows}=await q.query<NearbyItem>(`select n.code,n.title,n.starts_at as "startsAt",n.ends_at as "endsAt",${local('n.starts_at','$3::text')} as starts,${local('n.ends_at','$3::text')} as ends,n.place,n.host,f.name as feed
   from emba_team_nearby n join emba_team_feed f on f.id=n.feed_id
   where n.org_id=$1 and n.loop_id=$2 and f.is_on and n.event_id is null and n.left_feed_at is null and coalesce(n.ends_at,n.starts_at)>clock_timestamp()
    and ($4::date is null or (n.starts_at at time zone $3::text)::date=$4::date)
   order by n.starts_at,n.title,n.code limit ${NEARBY.list}`,[team.orgId,team.loopId,base.timezone,day??null]);
  return {team:base.team,timezone:base.timezone,today:base.today,items:rows,untrusted:true as const};
 });
}
