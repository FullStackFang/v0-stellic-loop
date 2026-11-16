import 'server-only';
import type {Db} from '../db';
import type {Principal} from './access';
import {requireFirstParty} from './consent';
import {EmbaError} from './errors';
import {posts} from './team-core';

// The pilot's numbers (design D8 and D8a of loop-club-reach, spec
// pilot-metrics). For the operator only, and aggregate only: every number is
// a count over members or sessions, and nothing here returns a row for one
// member. What it cannot see is said on the page: a conversation in which the
// assistant never contacted Loop leaves no trace.

/** The operator is named by sign-in subject in LOOP_OPERATOR_SUBJECTS, apart from who may start a group. On the site only. */
export const isOperator=(p:Principal|null,env:Record<string,string|undefined>=process.env):p is Principal=>
 !!p&&p.clientId===null&&(env.LOOP_OPERATOR_SUBJECTS??'').split(',').map(subject=>subject.trim()).filter(Boolean).includes(p.subject);

/** A row is shown only when it counts at least this many members, so no row describes one person. */
export const SMALLEST=3;
export const ROUTES=['site','share_link','personal_link','assistant','assistant_card','whatsapp'] as const;
export type Route=typeof ROUTES[number];
export type HostRow={host:string;
 /** Members with at least one session from this host. */
 members:number;sessions:number;
 /** Sessions whose first Loop call was `waiting`, was another tool, or that made no call. */
 waitingFirst:number;otherFirst:number;noCall:number;
 /** Answers and interest marks made by a tap on the card, and by the model in text. */
 byCard:number;byModel:number};
export type FunnelRow={host:string;signedIn:number;granted:number;called:number};
export type GroupRow={group:string;
 /** The Monday of the week the asks were created in. */
 week:string;asks:number;
 /** Members who can answer now, times the asks: the answers that could have come. */
 expected:number;
 /** Answers given within 48 hours of the ask, by how they arrived. An answer changed later counts from its last change. */
 within48:Record<Route,number>;
 /** Half the asks that have ended took at most this many hours from being asked to closing. Null when none has ended. */
 medianHoursToClose:number|null};
export type Metrics={days:number;hosts:HostRow[];funnel:{joined:number;openedConnectPage:number;hosts:FunnelRow[]};groups:GroupRow[]};

const host="coalesce(s.host_name,'not stated')";
/** Operator only. The numbers for the last `days` days; the funnel counts members since the start. */
export async function pilotMetrics(db:Db,p:Principal|null,days=28):Promise<Metrics> {
 if(!isOperator(p)||!Number.isInteger(days)||days<1||days>366)throw new EmbaError('forbidden');
 return db.tx(async q=>{
  await q.query('set transaction isolation level repeatable read');
  await requireFirstParty(q,p);
  const since=`clock_timestamp()-interval '${days} days'`;
  const {rows:hosts}=await q.query<Omit<HostRow,'byCard'|'byModel'>>(`select ${host} as host,count(distinct s.person_id)::int as members,count(*)::int as sessions,
    count(*) filter(where f.tool='waiting')::int as "waitingFirst",count(*) filter(where f.tool is not null and f.tool<>'waiting')::int as "otherFirst",count(*) filter(where f.tool is null)::int as "noCall"
   from emba_connector_session s left join lateral (select c.tool from emba_connector_call c where c.session_id=s.id and c.first_in_session order by c.at,c.id limit 1) f on true
   where s.at>=${since} group by 1 order by 1`);
  const {rows:writes}=await q.query<{host:string;via:'model'|'card';n:number}>(`select ${host} as host,c.via,count(*)::int as n from emba_connector_call c left join emba_connector_session s on s.id=c.session_id
   where c.tool in ('answer','interested') and c.at>=${since} group by 1,2`);
  const wrote=(name:string,via:'model'|'card')=>writes.find(row=>row.host===name&&row.via===via)?.n??0;
  const {rows:[all]}=await q.query<{joined:number;opened:number}>('select (select count(distinct person_id)::int from emba_membership where revoked_at is null) as joined,(select count(*)::int from emba_connect_view) as opened');
  const {rows:funnel}=await q.query<FunnelRow>(`select ${host} as host,count(distinct s.person_id)::int as "signedIn",
    count(distinct s.person_id) filter(where exists(select 1 from emba_lease l where l.person_id=s.person_id and l.client_id=s.client_id and l.org_id is not null))::int as granted,
    count(distinct s.person_id) filter(where exists(select 1 from emba_connector_call c where c.session_id=s.id))::int as called
   from emba_connector_session s group by 1 order by 1`);
  const {rows:groups}=await q.query<{orgId:string;loopId:string;group:string;week:string;asks:number;members:number;medianHoursToClose:number|null}>(`select k.org_id as "orgId",k.loop_id as "loopId",
    case when d.slug='workspace' then '@'||d.namespace else '@'||d.namespace||'/'||d.slug end as "group",to_char(date_trunc('week',k.created_at),'YYYY-MM-DD') as week,count(*)::int as asks,
    (select count(*)::int from emba_membership m where m.org_id=k.org_id and m.revoked_at is null and ${posts('m.person_id','k.org_id','k.loop_id')}) as members,
    round((percentile_cont(0.5) within group(order by extract(epoch from coalesce(k.closed_at,k.closes_at)-k.created_at)/3600) filter(where coalesce(k.closed_at,k.closes_at)<=clock_timestamp()))::numeric,1)::float8 as "medianHoursToClose"
   from emba_ask k join emba_group_address d on d.org_id=k.org_id and d.loop_id=k.loop_id and d.retired_at is null
   where k.created_at>=${since} group by k.org_id,k.loop_id,d.namespace,d.slug,date_trunc('week',k.created_at) order by 3,4`);
  const {rows:answers}=await q.query<{loopId:string;week:string;route:Route;n:number}>(`select k.loop_id as "loopId",to_char(date_trunc('week',k.created_at),'YYYY-MM-DD') as week,a.route,count(*)::int as n
   from emba_ask k join emba_ask_answer a on a.ask_id=k.id where k.created_at>=${since} and a.at<=k.created_at+interval '48 hours' group by 1,2,3`);
  // Small rows are added into one "other" row, and that row is dropped too if it is still small.
  const fold=<T extends {host:string}>(list:T[],size:(row:T)=>number):T[]=>{
   const small=list.filter(row=>size(row)<SMALLEST),rest=list.filter(row=>size(row)>=SMALLEST);
   if(!small.length)return rest;
   const other={...small[0]} as Record<string,unknown>;
   for(const row of small.slice(1))for(const [key,value] of Object.entries(row))if(typeof value==='number')other[key]=(other[key] as number)+value;
   other.host='other assistants';
   return size(other as T)>=SMALLEST?[...rest,other as T]:rest;
  };
  return {days,hosts:fold(hosts.map(row=>({...row,byCard:wrote(row.host,'card'),byModel:wrote(row.host,'model')})),row=>row.members),
   funnel:{joined:all.joined,openedConnectPage:all.opened,hosts:fold(funnel,row=>row.signedIn)},
   groups:groups.filter(row=>row.members>=SMALLEST).map(({orgId:_org,loopId,members,...row})=>{void _org;return {...row,expected:members*row.asks,
    within48:Object.fromEntries(ROUTES.map(route=>[route,answers.find(answer=>answer.loopId===loopId&&answer.week===row.week&&answer.route===route)?.n??0])) as Record<Route,number>};})};
 });
}

const cell=(value:string|number|null)=>{const text=value===null?'':String(value);return /[",\n]|^[=+\-@]/.test(text)?`"${text.replace(/"/g,'""').replace(/^([=+\-@])/,"'$1")}"`:text;};
/** One row per group and week, and no row per member. A group is written without its leading @, which a spreadsheet would read as a formula. */
export function metricsCsv(metrics:Metrics):string {
 const head=['group','week','asks','expected_answers',...ROUTES.map(route=>`within_48h_${route}`),'median_hours_to_close'];
 return [head,...metrics.groups.map(row=>[row.group.replace(/^@/,''),row.week,row.asks,row.expected,...ROUTES.map(route=>row.within48[route]),row.medianHoursToClose])].map(line=>line.map(cell).join(',')).join('\r\n')+'\r\n';
}

/** The one funnel step no other table shows: the signed-in member opened the connect page. Recorded once. */
export async function noteConnectView(db:Db,p:Principal):Promise<void> {
 if(p.clientId!==null)return;
 await db.query('insert into emba_connect_view(person_id) values($1) on conflict do nothing',[p.personId]).catch(()=>{});
}
