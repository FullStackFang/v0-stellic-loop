import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { canAccessLoop, type Principal } from './access';
import { audit, authorize, requireFirstParty } from './consent';
import { EmbaError } from './errors';
import { resolveCoordination } from './coordination';
import { enqueueActivityUpdate } from './delivery';

const terms = z.strictObject({orgId:z.uuid(),loopId:z.uuid(),title:z.string().trim().min(1).max(160),place:z.string().trim().min(1).max(160),
  timezone:z.string().refine(v=>{try {new Intl.DateTimeFormat('en',{timeZone:v});return true;} catch{return false;}}),
  startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true}),deadline:z.iso.datetime({offset:true})})
  .refine(v=>Date.parse(v.endsAt)>Date.parse(v.startsAt)&&Date.parse(v.deadline)<=Date.parse(v.startsAt)&&Date.parse(v.deadline)>Date.now());
export const activityTermsSchema=terms;
export const activityPublicationSchema=z.strictObject({activityId:z.uuid(),operationId:z.uuid(),terms});
export const commitmentSchema = z.strictObject({activityId:z.uuid(),revision:z.number().int().positive(),operationId:z.uuid(),minOthers:z.number().int().min(0).max(100000),requires:z.array(z.uuid()).max(100).default([])})
  .refine(v=>new Set(v.requires).size===v.requires.length);
type Activity = {id:string;org_id:string;loop_id:string;creator_id:string|null;revision:number;state:string;degraded:boolean;event_version:number};
type Commitment = {person_id:string;min_others:number;requires:string[];status:string};
export async function lockActivity(q:Q,id:string):Promise<Activity> {
  z.uuid().parse(id);
  const {rows:[a]}=await q.query<Activity>('select * from emba_activity where id=$1 for update',[id]);
  if(!a) throw new EmbaError('not_found');
  return a;
}
// Activity scope is immutable. Authorize before locking the activity so lifecycle
// revocation and deletion can consistently lock person/authority before activity.
export async function lockAuthorizedActivity(q:Q,p:Principal,id:string,action:'read'|'commit'|'manage'|'creator') {
  z.uuid().parse(id);
  const {rows:[scope]}=await q.query<Activity>('select * from emba_activity where id=$1',[id]);
  if(!scope)throw new EmbaError('not_found');
  if(action==='creator')await manager(q,p,scope);else await permission(q,p,scope,action);
  return lockActivity(q,id);
}
async function permission(q:Q,p:Principal,a:Activity,action:'read'|'commit'|'post'|'manage') {
  if(!await canAccessLoop(q,p,a.org_id,a.loop_id,action)) throw new EmbaError('forbidden');
}
async function manager(q:Q,p:Principal,a:Activity) {
  await permission(q,p,a,'read');
  if(a.creator_id!==p.personId) await permission(q,p,a,'manage');
}
function revision(a:Activity,v:number) {if(a.revision!==v) throw new EmbaError('conflict');}
async function insertTerms(q:Q,id:string,v:number,data:z.infer<typeof terms>) {
  await q.query('insert into emba_activity_revision values ($1,$2,$3,$4,$5,$6,$7,$8)',[id,v,data.title,data.place,data.timezone,data.startsAt,data.endsAt,data.deadline]);
}
/** Trusted confirmation callback: bind targetId=activityId and expectedVersion=1. */
export async function createActivityInTransaction(q:Q,p:Principal,input:unknown) {
  const d=activityPublicationSchema.parse(input),data=d.terms;
  await q.query('select id from person where id=$1 for update',[p.personId]);
  const lease=await authorize(q,p,'activity:write',data);
  if(!await canAccessLoop(q,p,data.orgId,data.loopId,'post'))throw new EmbaError('forbidden');
  const hash=createHash('sha256').update(JSON.stringify(d)).digest('hex');
  const {rows:[prior]}=await q.query<{request_hash:string}>('select request_hash from emba_activity_operation where activity_id=$1 and person_id=$2 and operation_id=$3',[d.activityId,p.personId,d.operationId]);
  if(prior) {if(prior.request_hash!==hash)throw new EmbaError('conflict');return {id:d.activityId,revision:1};}
  const {rows}=await q.query('insert into emba_activity(id,org_id,loop_id,creator_id) values($1,$2,$3,$4) on conflict do nothing returning id',[d.activityId,data.orgId,data.loopId,p.personId]);
  if(!rows.length)throw new EmbaError('conflict');
  await insertTerms(q,d.activityId,1,data);
  await q.query('insert into emba_activity_operation values($1,$2,$3,$4)',[d.activityId,p.personId,d.operationId,hash]);
  await audit(q,p,'activity:create',d.activityId,lease);return {id:d.activityId,revision:1};
}
export async function createActivity(db:Db,p:Principal,input:unknown) {
  const data=terms.parse(input);
  return db.tx(async q=>{
    await requireFirstParty(q,p);
    if(!await canAccessLoop(q,p,data.orgId,data.loopId,'post')) throw new EmbaError('forbidden');
    const {rows:[a]}=await q.query<{id:string;revision:number}>('insert into emba_activity(org_id,loop_id,creator_id) values($1,$2,$3) returning id,revision',[data.orgId,data.loopId,p.personId]);
    await insertTerms(q,a.id,1,data); await audit(q,p,'activity:create',a.id); return a;
  });
}
export async function reviseActivity(db:Db,p:Principal,id:string,expectedRevision:number,input:unknown) {
  const data=terms.parse(input);
  return db.tx(async q=>{
    await requireFirstParty(q,p); const a=await lockAuthorizedActivity(q,p,id,'creator'); revision(a,expectedRevision);
    if(a.org_id!==data.orgId||a.loop_id!==data.loopId||a.state==='completed'||a.state==='cancelled') throw new EmbaError('conflict');
    await insertTerms(q,id,a.revision+1,data);
    await q.query("update emba_activity set revision=revision+1,state='open',degraded=false where id=$1",[id]);
    await enqueueActivityUpdate(q,{id,revision:a.revision+1},'reopened',a.revision);
    await audit(q,p,'activity:revise',id); return {id,revision:a.revision+1};
  });
}
/** Only call inside an authenticated first-party transaction or consumeConfirmation callback. */
export async function saveCommitmentInTransaction(q:Q,p:Principal,input:unknown) {
  const d=commitmentSchema.parse(input); const a=await lockAuthorizedActivity(q,p,d.activityId,'commit');
  const lease=await authorize(q,p,'activity:write',{orgId:a.org_id,loopId:a.loop_id}); await permission(q,p,a,'commit');
  const hash=createHash('sha256').update(JSON.stringify(d)).digest('hex');
  const {rows:[previous]}=await q.query<{request_hash:string}>('select request_hash from emba_activity_operation where activity_id=$1 and person_id=$2 and operation_id=$3',[a.id,p.personId,d.operationId]);
  if(previous) {if(previous.request_hash!==hash)throw new EmbaError('conflict');return {id:a.id,revision:d.revision};}
  revision(a,d.revision);
  const {rows:open}=await q.query('select 1 from emba_activity_revision where activity_id=$1 and revision=$2 and deadline>clock_timestamp()',[a.id,a.revision]);
  if(a.state!=='open'||!open.length) throw new EmbaError('conflict');
  if(d.requires.includes(p.personId)) throw new EmbaError('forbidden');
  for(const target of d.requires) {
    const {rows}=await q.query('select 1 from emba_dependency_consent where activity_id=$1 and revision=$2 and target_id=$3 and requester_id=$4 and allowed',[a.id,a.revision,target,p.personId]);
    if(!rows.length) throw new EmbaError('forbidden');
  }
  await q.query(`insert into emba_commitment(activity_id,revision,person_id,min_others,requires,status) values($1,$2,$3,$4,$5,'active')
    on conflict(activity_id,revision,person_id) do update set min_others=excluded.min_others,requires=excluded.requires,status='active'`,[a.id,a.revision,p.personId,d.minOthers,d.requires]);
  await q.query('insert into emba_activity_operation values($1,$2,$3,$4)',[a.id,p.personId,d.operationId,hash]);
  await audit(q,p,'activity:commit',a.id,lease); return {id:a.id,revision:a.revision};
}
export async function saveCommitment(db:Db,p:Principal,input:unknown) {return db.tx(async q=>{await requireFirstParty(q,p);return saveCommitmentInTransaction(q,p,input);});}

// Current inherited membership, role and identity are tested at the snapshot boundary.
export async function eligibleActivityParticipant(q:Q,a:{org_id:string;loop_id:string},personId:string) {
  const {rows}=await q.query(`with recursive ancestors as (
    select id,parent_id from emba_loop where org_id=$1 and id=$2 union all
    select l.id,l.parent_id from emba_loop l join ancestors a on l.id=a.parent_id where l.org_id=$1)
    select 1 from ancestors a join emba_role r on r.loop_id=a.id and r.org_id=$1
    join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id
    where r.person_id=$3 and r.revoked_at is null and m.revoked_at is null and r.role in ('owner','organizer','member')
    and exists(select 1 from emba_identity i where i.person_id=r.person_id and i.revoked_at is null)
    and not exists(select 1 from emba_deletion_tombstone t where t.person_id=r.person_id) limit 1`,[a.org_id,a.loop_id,personId]);
  return rows.length>0;
}
async function resolve(q:Q,a:Activity,finalized:boolean) {
  const {rows}=await q.query<Commitment>(`select person_id,min_others,requires,status from emba_commitment where activity_id=$1 and revision=$2 and status=$3`,[a.id,a.revision,finalized?'satisfied':'active']);
  const context={orgId:a.org_id,loopId:a.loop_id,activityId:a.id,revision:a.revision};
  const candidates=[];
  for(const c of rows) {
    if(!await eligibleActivityParticipant(q,a,c.person_id)) continue;
    const {rows:consent}=await q.query<{target_id:string}>('select target_id from emba_dependency_consent where activity_id=$1 and revision=$2 and requester_id=$3 and allowed',[a.id,a.revision,c.person_id]);
    if(c.requires.some(id=>!consent.some(r=>r.target_id===id)))continue;
    candidates.push({...context,personId:c.person_id,minOthers:c.min_others,requires:c.requires.map(personId=>({...context,personId}))});
  }
  const survivors=resolveCoordination(context,candidates);
  for(const c of rows) await q.query('update emba_commitment set status=$4 where activity_id=$1 and revision=$2 and person_id=$3',[a.id,a.revision,c.person_id,survivors.includes(c.person_id)?'satisfied':finalized?'suspended':'unresolved']);
  if(finalized&&survivors.length<rows.length) await q.query('update emba_activity set degraded=true where id=$1',[a.id]);
}
export async function finalizeActivity(db:Db,p:Principal,id:string,v:number) {
  return db.tx(async q=>{
    await requireFirstParty(q,p);const a=await lockAuthorizedActivity(q,p,id,'creator');revision(a,v);
    if(a.state==='finalized') return {id,revision:v};
    const {rows}=await q.query('select 1 from emba_activity_revision where activity_id=$1 and revision=$2 and deadline<=clock_timestamp()',[id,v]);
    if(a.state!=='open'||!rows.length)throw new EmbaError('conflict');
    await resolve(q,a,false);
    await q.query('insert into emba_resolution(activity_id,revision) values($1,$2)',[id,v]);
    await q.query("insert into emba_resolution_outcome(activity_id,revision,person_id,satisfied) select activity_id,revision,person_id,status='satisfied' from emba_commitment where activity_id=$1 and revision=$2",[id,v]);
    await q.query("update emba_activity set state='finalized' where id=$1",[id]);
    await enqueueActivityUpdate(q,a,'finalized'); await audit(q,p,'activity:finalize',id);return {id,revision:v};
  });
}
export async function withdrawCommitment(db:Db,p:Principal,id:string,v:number) {
  return db.tx(async q=>{
    await requireFirstParty(q,p);const a=await lockActivity(q,id);revision(a,v);
    if(!['open','finalized'].includes(a.state))throw new EmbaError('conflict');
    const {rows}=await q.query("update emba_commitment set status='withdrawn',disclose_name=false where activity_id=$1 and revision=$2 and person_id=$3 and status<>'withdrawn' returning person_id",[id,v,p.personId]);
    if(rows.length&&a.state==='finalized') {await q.query('update emba_activity set degraded=true where id=$1',[id]);await resolve(q,a,true);await enqueueActivityUpdate(q,a,'changed');}
    await audit(q,p,'activity:withdraw',id);
  });
}
export async function setDependencyConsent(db:Db,p:Principal,id:string,v:number,requesterId:string,allowed:boolean) {
  z.uuid().parse(requesterId);z.boolean().parse(allowed);
  return db.tx(async q=>{
    await requireFirstParty(q,p);const a=await lockAuthorizedActivity(q,p,id,'commit');revision(a,v);
    if(requesterId===p.personId||!['open','finalized'].includes(a.state))throw new EmbaError('forbidden');
    await q.query('insert into emba_dependency_consent values($1,$2,$3,$4,$5) on conflict(activity_id,revision,target_id,requester_id) do update set allowed=excluded.allowed',[id,v,p.personId,requesterId,allowed]);
    if(!allowed) {
      const {rows}=await q.query("update emba_commitment set status='suspended' where activity_id=$1 and revision=$2 and person_id=$3 and $4=any(requires) and status in ('active','satisfied') returning person_id",[id,v,requesterId,p.personId]);
      if(rows.length) {if(a.state==='finalized'){await q.query('update emba_activity set degraded=true where id=$1',[id]);await resolve(q,a,true);}await enqueueActivityUpdate(q,a,'changed');}
    }
    await audit(q,p,'activity:dependency-consent',id);
  });
}
/** Trusted lifecycle hook: call in same transaction as membership/role/identity revocation. */
export async function revokeActivityEligibility(q:Q,personId:string) {
  const {rows}=await q.query<{id:string}>(`select distinct a.id from emba_activity a join emba_commitment c on c.activity_id=a.id and c.revision=a.revision where (c.person_id=$1 or $1=any(c.requires)) and a.state in ('open','finalized') order by a.id`,[personId]);
  for(const {id} of rows) {
    const a=await lockActivity(q,id); if(await eligibleActivityParticipant(q,a,personId))continue;
    await q.query("update emba_commitment set status='withdrawn',disclose_name=false where activity_id=$1 and revision=$2 and person_id=$3",[id,a.revision,personId]);
    await q.query("update emba_commitment set status='suspended' where activity_id=$1 and revision=$2 and $3=any(requires) and status in ('active','satisfied')",[id,a.revision,personId]);
    if(a.state==='finalized'){await q.query('update emba_activity set degraded=true where id=$1',[id]);await resolve(q,a,true);}
    await enqueueActivityUpdate(q,a,'changed');
  }
}
export async function closeActivity(db:Db,p:Principal,id:string,v:number,state:'completed'|'cancelled') {
  z.enum(['completed','cancelled']).parse(state);
  return db.tx(async q=>{
    await requireFirstParty(q,p);const a=await lockAuthorizedActivity(q,p,id,'creator');revision(a,v);
    if(a.state===state)return;
    if(a.state==='completed'||a.state==='cancelled'||state==='completed'&&a.state!=='finalized')throw new EmbaError('conflict');
    await q.query('update emba_activity set state=$2 where id=$1',[id,state]);
    const {rows:[counts]}=await q.query<{yes:number;no:number}>(`select count(*) filter(where status='satisfied')::int yes,count(*) filter(where status<>'satisfied')::int no from emba_commitment where activity_id=$1 and revision=$2`,[id,v]);
    const report=counts.yes<5||counts.no<5?{suppressed:true}:{suppressed:false,resolved:counts.yes,notResolved:counts.no};
    await q.query('insert into emba_activity_report values($1,$2) on conflict do nothing',[id,JSON.stringify(report)]);
    await enqueueActivityUpdate(q,a,state);await audit(q,p,'activity:'+state,id);
  });
}
export async function readActivity(db:Db,p:Principal,id:string) {
  return db.tx(async q=>{
    const a=await lockAuthorizedActivity(q,p,id,'read');const lease=await authorize(q,p,'plan:read',{orgId:a.org_id,loopId:a.loop_id});
    const {rows:[term]}=await q.query<{title:string;place:string;timezone:string;starts_at:string;ends_at:string;deadline:string}>('select title,place,timezone,starts_at,ends_at,deadline from emba_activity_revision where activity_id=$1 and revision=$2',[id,a.revision]);
    const {rows:[own]}=await q.query<{status:string;min_others:number;requires:string[];disclose_name:boolean}>('select status,min_others,requires,disclose_name from emba_commitment where activity_id=$1 and revision=$2 and person_id=$3',[id,a.revision,p.personId]);
    await audit(q,p,'activity:read',id,lease);
    return {id,revision:a.revision,state:a.state,degraded:a.degraded,...term,ownCommitment:own??null};
  });
}
export const activityQuerySchema=z.strictObject({orgId:z.uuid(),loopId:z.uuid(),place:z.string().max(160).optional(),start:z.iso.datetime({offset:true}).optional(),end:z.iso.datetime({offset:true}).optional(),limit:z.number().int().min(1).max(50).default(20)});
export type ActivityListItem={id:string;revision:number;state:string;degraded:boolean;title:string;place:string;timezone:string;starts_at:string;ends_at:string;deadline:string;own_status:string|null};
export async function listActivities(db:Db,p:Principal,input:unknown) {
  const d=activityQuerySchema.parse(input);
  return db.tx(async q=>{
    const lease=await authorize(q,p,'plan:read',d);
    const {rows}=await q.query<ActivityListItem>(`select a.id,a.revision,a.state,a.degraded,v.title,v.place,v.timezone,v.starts_at,v.ends_at,v.deadline,c.status as own_status
      from emba_activity a join emba_activity_revision v on v.activity_id=a.id and v.revision=a.revision
      left join emba_commitment c on c.activity_id=a.id and c.revision=a.revision and c.person_id=$3
      where a.org_id=$1 and a.loop_id=$2 and a.state<>'draft' and ($4::text is null or lower(v.place)=lower($4))
      and ($5::timestamptz is null or v.ends_at>$5) and ($6::timestamptz is null or v.starts_at<$6)
      order by v.starts_at,a.id limit $7`,[d.orgId,d.loopId,p.personId,d.place??null,d.start??null,d.end??null,d.limit+1]);
    await audit(q,p,'activity:list',null,lease);return {items:rows.slice(0,d.limit),truncated:rows.length>d.limit};
  });
}
