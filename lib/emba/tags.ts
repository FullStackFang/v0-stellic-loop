import 'server-only';
import {z} from 'zod';
import type {Db} from '../db';
import {canAccessPersonal,type Principal} from './access';
import {audit,authorize,requireFirstParty} from './consent';
import {EmbaError} from './errors';
import {listGroups,type GroupAddress} from './groups';
import {nameSchema} from './team-text';

const handleSchema=z.string().regex(/^@[a-z0-9][a-z0-9-]{1,47}(\/[a-z0-9][a-z0-9-]{1,47})?$/);
const GROUPS=50,ENTRIES=200,CANDIDATES=50;
// No person id is ever returned: a handle is the only name an assistant gets for a teammate.
export type TeamTag={kind:'team';handle:string;orgId:string;loopId:string;team:string};
export type EventTag={kind:'event';handle:string;name:string;team:string;teamHandle:string};
export type PersonTag={kind:'person';handle:string;team:string;isYou:boolean};
export type Tag=TeamTag|EventTag|PersonTag;
export type TagResolution={status:'resolved'|'ambiguous'|'unavailable';matches:Tag[]};
export type TagList={teams:TeamTag[];events:EventTag[];people:PersonTag[];partial:boolean};

// Every addressed group is a team with its own consent. The organization's
// root group is written @namespace; a nested group is @namespace/slug.
const isRoot=(group:GroupAddress)=>!group.loopPath.includes('/');
const teamHandle=(group:GroupAddress)=>isRoot(group)?`@${group.namespace}`:group.handle;
const teamTag=(group:GroupAddress):TeamTag=>({kind:'team',handle:teamHandle(group),orgId:group.orgId,loopId:group.loopId,team:group.orgName});
const denied=(error:unknown)=>error instanceof EmbaError&&error.code==='forbidden';
// A taggable person is a current member with a live role and sign-in.
const livePerson=`exists(select 1 from emba_membership m where m.org_id=h.org_id and m.person_id=h.person_id and m.revoked_at is null)
   and exists(select 1 from emba_role r where r.org_id=h.org_id and r.person_id=h.person_id and r.revoked_at is null)
   and exists(select 1 from emba_identity i where i.person_id=h.person_id and i.revoked_at is null)
   and not exists(select 1 from emba_deletion_tombstone t where t.person_id=h.person_id)`;

/**
 * Everything the caller may tag, up to fixed limits. Events belong to a team
 * the caller (and its assistant) can read; people appear only with access to
 * the root team. `partial` says a limit was reached; resolveTag is not
 * subject to these limits.
 */
export async function listTags(db:Db,p:Principal,input:unknown={}):Promise<TagList> {
 z.strictObject({}).parse(input);
 try {
  // listGroups already applies membership, exact assistant consent and audit.
  const groups=await listGroups(db,p,{limit:GROUPS});
  if(!groups.length)return {teams:[],events:[],people:[],partial:false};
  return await db.tx(async q=>{
   // Consent may have been revoked since discovery: recheck each team before reading under it.
   for(const group of groups)await authorize(q,p,'plan:read',group);
   const {rows:eventRows}=await q.query<{orgId:string;loopId:string;slug:string;name:string}>(`select e.org_id as "orgId",e.loop_id as "loopId",e.slug,e.name
    from emba_team_event e join unnest($1::uuid[],$2::uuid[]) as t(org_id,loop_id) on t.org_id=e.org_id and t.loop_id=e.loop_id
    where e.archived_at is null order by e.slug,e.id limit $3`,[groups.map(group=>group.orgId),groups.map(group=>group.loopId),ENTRIES+1]);
   const roots=groups.filter(isRoot);
   const {rows:personRows}=roots.length?await q.query<{orgId:string;personId:string;handle:string}>(`select h.org_id as "orgId",h.person_id as "personId",h.handle
    from emba_member_handle h where h.org_id=any($1::uuid[]) and ${livePerson} order by h.handle,h.org_id limit $2`,[roots.map(group=>group.orgId),ENTRIES+1]):{rows:[]};
   if(!await canAccessPersonal(q,p,p.personId))throw new EmbaError('forbidden');
   const events=eventRows.slice(0,ENTRIES).map(row=>{
    const group=groups.find(item=>item.orgId===row.orgId&&item.loopId===row.loopId)!;
    return {kind:'event' as const,handle:`@${group.namespace}/${row.slug}`,name:row.name,team:group.orgName,teamHandle:teamHandle(group)};
   });
   const people=personRows.slice(0,ENTRIES).map(row=>{
    const group=roots.find(item=>item.orgId===row.orgId)!;
    return {kind:'person' as const,handle:`@${group.namespace}/${row.handle}`,team:group.orgName,isYou:row.personId===p.personId};
   });
   // The group limit cannot be probed past, so a full page is reported as possibly partial.
   return {teams:groups.map(teamTag),events,people,partial:groups.length>=GROUPS||eventRows.length>ENTRIES||personRows.length>ENTRIES};
  });
 }catch(error){if(denied(error))return {teams:[],events:[],people:[],partial:false};throw error;}
}

type Candidate={kind:'team'|'event'|'person';orgId:string;loopId:string;namespace:string;slug:string;root:boolean;orgName:string;name:string|null;personId:string|null};
/**
 * Resolves @name or @team/name. Looks the name up directly among the caller's
 * organizations, then keeps only what the caller (and its assistant) is
 * authorized for, so it works however many teams or entries exist. Unknown
 * and unauthorized handles are indistinguishable.
 */
export async function resolveTag(db:Db,p:Principal,input:unknown):Promise<TagResolution> {
 const {handle}=z.strictObject({handle:handleSchema}).parse(input);
 const parts=handle.slice(1).split('/'),last=parts.at(-1)!,namespace=parts.length===2?parts[0]:null;
 try {
  return await db.tx(async q=>{
   if(!await canAccessPersonal(q,p,p.personId))throw new EmbaError('forbidden');
   const {rows}=await q.query<Candidate>(`with teams as (
     select a.org_id,a.loop_id,a.namespace,a.slug,l.parent_id is null as root,coalesce(l.name,o.name) as org_name
     from emba_group_address a join emba_loop l on l.org_id=a.org_id and l.id=a.loop_id join emba_organization o on o.id=a.org_id
     where a.retired_at is null and exists(select 1 from emba_membership m where m.org_id=a.org_id and m.person_id=$1 and m.revoked_at is null))
    select * from (
     select 'team' as kind,t.org_id as "orgId",t.loop_id as "loopId",t.namespace,t.slug,t.root,t.org_name as "orgName",null::text as name,null::uuid as "personId"
      from teams t where case when $2::text is null then (t.root and t.namespace=$3) or t.slug=$3 else t.namespace=$2 and t.slug=$3 end
     union all
     select 'event',t.org_id,t.loop_id,t.namespace,t.slug,t.root,t.org_name,e.name,null::uuid
      from emba_team_event e join teams t on t.org_id=e.org_id and t.loop_id=e.loop_id
      where e.archived_at is null and e.slug=$3 and ($2::text is null or t.namespace=$2)
     union all
     select 'person',t.org_id,t.loop_id,t.namespace,t.slug,t.root,t.org_name,null::text,h.person_id
      from emba_member_handle h join teams t on t.org_id=h.org_id and t.root
      where h.handle=$3 and ($2::text is null or t.namespace=$2) and ${livePerson}
    ) c order by c.kind,c.namespace,c.slug,c."loopId" limit $4`,[p.personId,namespace,last,CANDIDATES]);
   const matches=new Map<string,Tag>();
   for(const row of rows){
    let lease:string|null;
    try{lease=await authorize(q,p,'plan:read',row);}
    catch(error){if(denied(error))continue;throw error;}
    await audit(q,p,'plan:read',row.loopId,lease);
    const team=row.root?`@${row.namespace}`:`@${row.namespace}/${row.slug}`;
    const tag:Tag=row.kind==='team'?{kind:'team',handle:team,orgId:row.orgId,loopId:row.loopId,team:row.orgName}
     :row.kind==='event'?{kind:'event',handle:`@${row.namespace}/${last}`,name:row.name!,team:row.orgName,teamHandle:team}
     :{kind:'person',handle:`@${row.namespace}/${last}`,team:row.orgName,isYou:row.personId===p.personId};
    matches.set(`${tag.kind} ${tag.handle}`,tag);
   }
   if(!matches.size)await audit(q,p,'plan:read');
   if(!await canAccessPersonal(q,p,p.personId))throw new EmbaError('forbidden');
   const found=[...matches.values()];
   return {status:found.length===0?'unavailable':found.length===1?'resolved':'ambiguous',matches:found};
  });
 }catch(error){if(denied(error))return {status:'unavailable',matches:[]};throw error;}
}

const handleInput=z.strictObject({orgId:z.uuid(),handle:nameSchema.nullable()});
/** Site only: a member sets or clears the handle teammates tag them with. */
export async function setMemberHandle(db:Db,p:Principal,input:unknown):Promise<void> {
 const data=handleInput.parse(input);
 try {
  await db.tx(async q=>{
   await requireFirstParty(q,p);
   const {rows}=await q.query('select 1 from emba_membership where org_id=$1 and person_id=$2 and revoked_at is null for share',[data.orgId,p.personId]);
   if(!rows.length)throw new EmbaError('forbidden');
   // emba_team_name rejects a handle already used by the team's name, an event or a group in this namespace.
   if(data.handle===null)await q.query('delete from emba_member_handle where org_id=$1 and person_id=$2',[data.orgId,p.personId]);
   else await q.query('insert into emba_member_handle(org_id,person_id,handle) values($1,$2,$3) on conflict(org_id,person_id) do update set handle=excluded.handle',[data.orgId,p.personId,data.handle]);
   await audit(q,p,'activity:write',data.orgId);
  });
 }catch(error){if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='23505')throw new EmbaError('conflict');throw error;}
}
export async function getMemberHandle(db:Db,p:Principal,orgId:string):Promise<string|null> {
 z.uuid().parse(orgId);
 return db.tx(async q=>{
  await requireFirstParty(q,p);
  const {rows:[row]}=await q.query<{handle:string}>('select handle from emba_member_handle where org_id=$1 and person_id=$2',[orgId,p.personId]);
  return row?.handle??null;
 });
}
