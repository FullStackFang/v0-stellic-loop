import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import type {Principal} from './access';
import {instant,local,moment,posts,reading,scope,stop,teamWrite,viewMembers,type Listed,type Member,type Refused,type Scope,type TeamHead} from './team-core';
import {lineSchema} from './team-text';

// Travel (design D2 of loop-trip). One entry per member per team: when and
// where they arrive and leave, and optionally a flight number and where they
// are staying. It is the member's own statement: only they write it, Loopd
// checks no flight and concludes nothing from it. Members and followers of the
// team read every entry; nobody outside the team reads any.

export const TRAVEL={place:120,stay:120,flight:12,list:200,
 /** Two members land "around the same time" when their stated times at the same place are at most this far apart. */
 nearHours:2} as const;
/** One side of an entry: an arrival or a departure. */
export type TravelLeg={
 /** The instant, and the same moment in the team's timezone. With no time stated, the day alone. */
 at:string;when:string;
 /** False when the member stated the day and no time. */
 timed:boolean;place:string|null;flight:string|null};
export type TravelEntry={who:Member;arrival:TravelLeg|null;departure:TravelLeg|null;stay:string|null;
 /** When the member last changed it, as a date in the team's timezone. Loopd does not check flights. */
 changedOn:string;assistant:string|null;
 /** Another member whose stated arrival (or departure) is at the caller's place within two hours of the caller's. Never set on the caller's own entry. */
 nearYourArrival:boolean;nearYourDeparture:boolean};
export type Arrivals={team:TeamHead;timezone:string;today:string;yours:TravelEntry|null;
 /** Every entry, the caller's included, in order of arrival; entries with no arrival follow, in order of departure. */
 entries:Listed<TravelEntry>;untrusted:true};
export type TravelWrite=
 |{saved:true;changed:boolean;entry:TravelEntry}
 |Refused
 // An entry needs an arrival day or a departure day; a place or flight needs the day of its own side.
 |{saved:false;reason:'incomplete';problem:'no_day'|'arrival_needs_day'|'departure_needs_day'};
export type TravelRemoval={saved:true;removed:boolean}|Refused;
type Declined=Exclude<TravelWrite,{saved:true}|Refused>;

// A day and time as for an event, or a day alone.
const dayOnly=/^20\d{2}-\d{2}-\d{2}$/;
const when=z.union([moment,z.string().regex(dayOnly)]).nullish();
const flight=z.string().max(40).transform(value=>value.toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim()).refine(value=>/^[A-Z0-9][A-Z0-9 ]{1,10}[A-Z0-9]$/.test(value)).nullish();
// Left out means "leave as it is"; null means "clear it".
const travelSchema=z.strictObject({...scope,arrivesAt:when,arrivesPlace:lineSchema(TRAVEL.place).nullish(),arrivesFlight:flight,departsAt:when,departsPlace:lineSchema(TRAVEL.place).nullish(),departsFlight:flight,stay:lineSchema(TRAVEL.stay).nullish()});

type Row={personId:string;arrivesAt:string|null;arrives:string|null;arrivesTimed:boolean;arrivesPlace:string|null;arrivesFlight:string|null;
 departsAt:string|null;departs:string|null;departsTimed:boolean;departsPlace:string|null;departsFlight:string|null;stay:string|null;changedOn:string;clientId:string|null};
const shown=(column:string,timed:string)=>`case when ${column} is null then null when ${timed} then ${local(column,'$3::text')} else to_char(${column} at time zone $3::text,'Dy FMDD Mon YYYY') end`;
const columns=`t.person_id as "personId",t.arrives_at as "arrivesAt",${shown('t.arrives_at','t.arrives_timed')} as arrives,t.arrives_timed as "arrivesTimed",t.arrives_place as "arrivesPlace",t.arrives_flight as "arrivesFlight",
 t.departs_at as "departsAt",${shown('t.departs_at','t.departs_timed')} as departs,t.departs_timed as "departsTimed",t.departs_place as "departsPlace",t.departs_flight as "departsFlight",t.stay,
 to_char(t.changed_at at time zone $3::text,'YYYY-MM-DD') as "changedOn",t.client_id as "clientId"`;
const leg=(at:string|null,when:string|null,timed:boolean,place:string|null,flight:string|null):TravelLeg|null=>at&&when?{at:new Date(at).toISOString(),when,timed,place,flight}:null;
/** Both stated a time at the same place, and the times are within two hours. Places are compared as written, ignoring case. */
const near=(a:TravelLeg|null,b:TravelLeg|null)=>Boolean(a&&b&&a.timed&&b.timed&&a.place&&b.place&&a.place.toLowerCase()===b.place.toLowerCase()&&Math.abs(Date.parse(a.at)-Date.parse(b.at))<=TRAVEL.nearHours*3_600_000);

/** The team's entries of current members who may post, as the caller may see them. */
async function entries(q:Q,p:Principal,team:Scope,timezone:string,only?:string):Promise<{yours:TravelEntry|null;items:TravelEntry[];more:number}> {
 const {rows}=await q.query<Row>(`select ${columns} from emba_travel t where t.org_id=$1 and t.loop_id=$2 and ($4::uuid is null or t.person_id=$4) and ${posts('t.person_id')}
  order by t.arrives_at nulls last,t.departs_at,t.person_id limit ${TRAVEL.list+1}`,[team.orgId,team.loopId,timezone,only??null]);
 const person=await viewMembers(q,p,team,rows.map(row=>row.personId));
 const built=rows.map(row=>({personId:row.personId,arrival:leg(row.arrivesAt,row.arrives,row.arrivesTimed,row.arrivesPlace,row.arrivesFlight),departure:leg(row.departsAt,row.departs,row.departsTimed,row.departsPlace,row.departsFlight),row}));
 const mine=built.find(item=>item.personId===p.personId);
 const views=built.map(({personId,arrival,departure,row}):TravelEntry=>({who:person(personId),arrival,departure,stay:row.stay,changedOn:row.changedOn,assistant:row.clientId,
  nearYourArrival:personId!==p.personId&&near(mine?.arrival??null,arrival),nearYourDeparture:personId!==p.personId&&near(mine?.departure??null,departure)}));
 return {yours:mine?views[built.indexOf(mine)]:null,items:views.slice(0,TRAVEL.list),more:Math.max(0,views.length-TRAVEL.list)};
}

/**
 * Saves the caller's own travel for a team, or changes it: fields left out
 * stay as they are and null clears one. There is no way to name another
 * person. A member who may post, on the site or through an assistant with a
 * read-and-write grant.
 */
export async function saveTravel(db:Db,p:Principal,input:unknown):Promise<TravelWrite> {
 const data=travelSchema.parse(input);
 return teamWrite<Exclude<TravelWrite,Refused>>(db,p,data,{need:'post',count:true},async ctx=>{
  type Stored={arrivesAt:string|null;arrivesTimed:boolean;arrivesPlace:string|null;arrivesFlight:string|null;departsAt:string|null;departsTimed:boolean;departsPlace:string|null;departsFlight:string|null;stay:string|null};
  const {rows:[before]}=await ctx.q.query<Stored>(`select arrives_at as "arrivesAt",arrives_timed as "arrivesTimed",arrives_place as "arrivesPlace",arrives_flight as "arrivesFlight",departs_at as "departsAt",departs_timed as "departsTimed",
   departs_place as "departsPlace",departs_flight as "departsFlight",stay from emba_travel where org_id=$1 and loop_id=$2 and person_id=$3 for update`,[data.orgId,data.loopId,p.personId]);
  // A stated day or time becomes an instant in the team's timezone; a day alone is its midnight there.
  const stated=async(value:string|null|undefined,old:{at:string|null;timed:boolean}|undefined)=>{
   if(value===undefined)return old??{at:null,timed:true};
   if(value===null)return {at:null,timed:true};
   const timed=!dayOnly.test(value);
   const {rows:[row]}=await ctx.q.query<{at:string}>(`select ${instant(1,2)} as at`,[timed?value:`${value}T00:00`,ctx.timezone]);
   return {at:row.at,timed};
  };
  const keep=<T,>(value:T|null|undefined,old:T|null|undefined):T|null=>value===undefined?old??null:value;
  const arrives=await stated(data.arrivesAt,before&&{at:before.arrivesAt,timed:before.arrivesTimed}),departs=await stated(data.departsAt,before&&{at:before.departsAt,timed:before.departsTimed});
  const next:Stored={arrivesAt:arrives.at,arrivesTimed:arrives.timed,arrivesPlace:keep(data.arrivesPlace,before?.arrivesPlace),arrivesFlight:keep(data.arrivesFlight,before?.arrivesFlight),
   departsAt:departs.at,departsTimed:departs.timed,departsPlace:keep(data.departsPlace,before?.departsPlace),departsFlight:keep(data.departsFlight,before?.departsFlight),stay:keep(data.stay,before?.stay)};
  const no=(problem:Declined['problem'])=>stop<Declined>({saved:false,reason:'incomplete',problem});
  if(!next.arrivesAt&&!next.departsAt)no('no_day');
  if(!next.arrivesAt&&(next.arrivesPlace||next.arrivesFlight))no('arrival_needs_day');
  if(!next.departsAt&&(next.departsPlace||next.departsFlight))no('departure_needs_day');
  const instantOf=(value:string|null)=>value===null?null:Date.parse(value);
  const same=Boolean(before)&&(Object.keys(next) as (keyof Stored)[]).every(key=>key==='arrivesAt'||key==='departsAt'?instantOf(next[key])===instantOf(before![key]):next[key]===before![key]);
  if(!same)await ctx.q.query(`insert into emba_travel(org_id,loop_id,person_id,arrives_at,arrives_timed,arrives_place,arrives_flight,departs_at,departs_timed,departs_place,departs_flight,stay,client_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
   on conflict(org_id,loop_id,person_id) do update set arrives_at=excluded.arrives_at,arrives_timed=excluded.arrives_timed,arrives_place=excluded.arrives_place,arrives_flight=excluded.arrives_flight,departs_at=excluded.departs_at,departs_timed=excluded.departs_timed,
    departs_place=excluded.departs_place,departs_flight=excluded.departs_flight,stay=excluded.stay,client_id=excluded.client_id,changed_at=clock_timestamp()`,
   [data.orgId,data.loopId,p.personId,next.arrivesAt,next.arrivesTimed,next.arrivesPlace,next.arrivesFlight,next.departsAt,next.departsTimed,next.departsPlace,next.departsFlight,next.stay,p.clientId]);
  return {saved:true,changed:!same,entry:(await entries(ctx.q,p,ctx.team,ctx.timezone,p.personId)).yours!};
 });
}
/** Deletes the caller's own travel entry for a team. It no longer appears to anyone. */
export async function removeTravel(db:Db,p:Principal,input:unknown):Promise<TravelRemoval> {
 const team=z.strictObject(scope).parse(input);
 return teamWrite<Exclude<TravelRemoval,Refused>>(db,p,team,{need:'post',count:true},async ctx=>{
  const {rows}=await ctx.q.query('delete from emba_travel where org_id=$1 and loop_id=$2 and person_id=$3 returning person_id',[team.orgId,team.loopId,p.personId]);
  return {saved:true,removed:rows.length>0};
 });
}
/**
 * Who arrives and leaves when. Members and followers of the team; nobody
 * else. A member with no entry is not listed and nothing is said about them.
 */
export async function arrivals(db:Db,p:Principal,input:unknown):Promise<Arrivals> {
 const team=z.strictObject(scope).parse(input);
 return reading(db,p,team,async({q,...base})=>{
  const found=await entries(q,p,team,base.timezone);
  return {team:base.team,timezone:base.timezone,today:base.today,yours:found.yours,entries:{items:found.items,more:found.more},untrusted:true as const};
 });
}
