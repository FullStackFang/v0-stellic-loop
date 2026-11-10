import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import {canAccessLoop,canAccessPersonal,type Principal} from './access';
import {audit,authorize,requireFirstParty} from './consent';
import {EmbaError} from './errors';

const name=z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}$/);
const scope=z.strictObject({orgId:z.uuid(),loopId:z.uuid()});
const registration=scope.extend({namespace:name,slug:name});
const unavailable={status:'unavailable' as const,connectionsPath:'/emba' as const};
export type GroupAddress={orgId:string;loopId:string;namespace:string;slug:string;handle:string;orgName:string;loopPath:string};
export type GroupResolution={status:'resolved';group:GroupAddress}|{status:'ambiguous';groups:GroupAddress[]}|typeof unavailable;
const columns=`a.org_id as "orgId",a.loop_id as "loopId",a.namespace,a.slug,'@'||a.namespace||'/'||a.slug as handle,o.name as "orgName",l.path as "loopPath"`;

async function rootOwner(q:Q,p:Principal,data:{orgId:string;loopId:string}) {
 await requireFirstParty(q,p);
 // Lock all relevant hierarchy and authority before any address resource lock.
 if(!await canAccessLoop(q,p,data.orgId,data.loopId,'delegate_organizer'))throw new EmbaError('forbidden');
 const {rows}=await q.query(`with recursive ancestors as (
  select id,parent_id from emba_loop where org_id=$1 and id=$2
  union all select l.id,l.parent_id from emba_loop l join ancestors a on l.id=a.parent_id where l.org_id=$1)
  select r.person_id from ancestors a join emba_role r on r.org_id=$1 and r.loop_id=a.id
  where a.parent_id is null and r.person_id=$3 and r.role='owner' and r.revoked_at is null for share of r`,[data.orgId,data.loopId,p.personId]);
 if(!rows.length)throw new EmbaError('forbidden');
}
/** UI capability check shares exactly the mutation's root-owner predicate. */
export async function canManageGroupAddress(q:Q,p:Principal,data:{orgId:string;loopId:string}):Promise<boolean> {
 try{await rootOwner(q,p,data);return true;}
 catch(error){if(error instanceof EmbaError&&error.code==='forbidden')return false;throw error;}
}
async function currentAddress(q:Q,data:{orgId:string;loopId:string}):Promise<GroupAddress> {
 const {rows:[row]}=await q.query<GroupAddress>(`select ${columns} from emba_group_address a join emba_organization o on o.id=a.org_id
  join emba_loop l on l.org_id=a.org_id and l.id=a.loop_id where a.org_id=$1 and a.loop_id=$2 and a.retired_at is null for share of a,o,l`,[data.orgId,data.loopId]);
 if(!row)throw new EmbaError('forbidden');return row;
}
export async function registerGroupAddress(db:Db,p:Principal,input:unknown):Promise<GroupAddress> {
 const data=registration.parse(input);
 try {
  return await db.tx(async q=>{
   await rootOwner(q,p,data);
   await q.query('insert into emba_group_namespace(org_id,namespace) values($1,$2) on conflict(org_id) do nothing',[data.orgId,data.namespace]);
   const {rows:[existing]}=await q.query<{namespace:string}>('select namespace from emba_group_namespace where org_id=$1',[data.orgId]);
   if(existing.namespace!==data.namespace)throw new EmbaError('conflict');
   await q.query('insert into emba_group_address(org_id,loop_id,namespace,slug) values($1,$2,$3,$4)',[data.orgId,data.loopId,data.namespace,data.slug]);
   await audit(q,p,'plan:read',data.loopId);
   await rootOwner(q,p,data);
   return currentAddress(q,data);
  });
 }catch(error){if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='23505')throw new EmbaError('conflict');throw error;}
}
export async function retireGroupAddress(db:Db,p:Principal,input:unknown):Promise<void> {
 const data=scope.parse(input);
 await db.tx(async q=>{
  await rootOwner(q,p,data);
  const {rows}=await q.query('update emba_group_address set retired_at=coalesce(retired_at,clock_timestamp()) where org_id=$1 and loop_id=$2 returning loop_id',[data.orgId,data.loopId]);
  if(!rows.length)throw new EmbaError('not_found');
  await audit(q,p,'plan:read',data.loopId);
  await rootOwner(q,p,data);
 });
}

async function discover(db:Db,p:Principal,limit:number,namespace:string|null=null,slug:string|null=null):Promise<GroupAddress[]> {
 return db.tx(async q=>{
  if(!await canAccessPersonal(q,p,p.personId))throw new EmbaError('forbidden');
  // Filter membership, inherited roles and exact client consent BEFORE limiting.
  // Hidden groups therefore neither consume result slots nor create ambiguity.
  const {rows}=await q.query<{orgId:string;loopId:string}>(`with recursive accessible as (
   select l.id,l.org_id from emba_loop l join emba_role r on r.org_id=l.org_id and r.loop_id=l.id
   join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id
   where r.person_id=$1 and r.revoked_at is null and m.revoked_at is null
   union select l.id,l.org_id from emba_loop l join accessible a on l.org_id=a.org_id and l.parent_id=a.id
  ) select g.org_id as "orgId",g.loop_id as "loopId" from emba_group_address g join accessible a on a.org_id=g.org_id and a.id=g.loop_id
   where g.retired_at is null and ($3::text is null or g.namespace=$3) and ($4::text is null or g.slug=$4)
   and ($2::text is null or ($5::boolean and exists(select 1 from emba_lease e where e.person_id=$1 and e.client_id=$2
    and e.org_id=g.org_id and e.loop_id=g.loop_id and 'plan:read'=any(e.actions) and e.revoked_at is null and e.expires_at>clock_timestamp())))
   order by g.namespace,g.slug limit $6`,[p.personId,p.clientId,namespace,slug,p.scopes.includes('plan:read'),limit]);
  for(const row of rows){const lease=await authorize(q,p,'plan:read',row);await audit(q,p,'plan:read',row.loopId,lease);}
  if(!rows.length)await audit(q,p,'plan:read');
  const groups:GroupAddress[]=[];
  for(const row of rows){await authorize(q,p,'plan:read',row);groups.push(await currentAddress(q,row));}
  if(!await canAccessPersonal(q,p,p.personId))throw new EmbaError('forbidden');
  return groups;
 });
}
export async function listGroups(db:Db,p:Principal,input:unknown={}):Promise<GroupAddress[]> {
 const {limit}=z.strictObject({limit:z.number().int().min(1).max(50).default(20)}).parse(input);
 return discover(db,p,limit);
}
export async function listPortalGroups(db:Db,p:Principal):Promise<GroupAddress[]> {
 // The authenticated portal may select a group before granting a client lease.
 await db.tx(q=>requireFirstParty(q,p));return discover(db,p,50);
}
export async function resolveGroup(db:Db,p:Principal,input:unknown):Promise<GroupResolution> {
 const {handle}=z.strictObject({handle:z.string().regex(/^@[a-z0-9][a-z0-9-]{1,47}(\/[a-z0-9][a-z0-9-]{1,47})?$/)}).parse(input);
 const parts=handle.slice(1).split('/');
 try {
  const groups=await discover(db,p,50,parts.length===2?parts[0]:null,parts.at(-1)!);
  return groups.length===0?unavailable:groups.length===1?{status:'resolved',group:groups[0]}:{status:'ambiguous',groups};
 }catch(error){if(error instanceof EmbaError&&error.code==='forbidden')return unavailable;throw error;}
}
