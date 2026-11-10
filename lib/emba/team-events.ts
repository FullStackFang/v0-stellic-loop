import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import {canAccessLoop,type Principal} from './access';
import {audit,requireFirstParty} from './consent';
import {EmbaError} from './errors';
import {lineSchema,nameSchema} from './team-text';

// An event name is shown inside assistant results, so it is one cleaned line.
const title=lineSchema(80);
const team=z.strictObject({orgId:z.uuid(),loopId:z.uuid()});
export type TeamEvent={id:string;slug:string;name:string;archived:boolean};

// Site only. Owners and organizers of the team; never an assistant.
async function manager(q:Q,p:Principal,scope:{orgId:string;loopId:string}) {
 // Same lock order as account deletion: the person first, then anything they own.
 await q.query('select id from person where id=$1 for update',[p.personId]);
 await requireFirstParty(q,p);
 if(!await canAccessLoop(q,p,scope.orgId,scope.loopId,'manage'))throw new EmbaError('forbidden');
}
async function currentTeam(q:Q,scope:{orgId:string;loopId:string}) {
 // The foreign key alone would accept a team whose address was retired.
 const {rows:[address]}=await q.query('select 1 from emba_group_address where org_id=$1 and loop_id=$2 and retired_at is null for share',[scope.orgId,scope.loopId]);
 if(!address)throw new EmbaError('forbidden');
}
/** Authorizes before taking any lock on the event, then locks and rechecks it. Unknown and unauthorized are the same answer. */
async function owned(q:Q,p:Principal,orgId:string,eventId:string):Promise<{orgId:string;loopId:string;archived:boolean}> {
 const {rows:[found]}=await q.query<{loopId:string}>('select loop_id as "loopId" from emba_team_event where org_id=$1 and id=$2',[orgId,eventId]);
 if(!found){await requireFirstParty(q,p);throw new EmbaError('forbidden');}
 await manager(q,p,{orgId,loopId:found.loopId});
 const {rows:[row]}=await q.query<{loopId:string;archived:boolean}>('select loop_id as "loopId",archived_at is not null as archived from emba_team_event where org_id=$1 and id=$2 for update',[orgId,eventId]);
 if(!row||row.loopId!==found.loopId)throw new EmbaError('forbidden');
 return {orgId,...row};
}
const taken=(error:unknown)=>typeof error==='object'&&error!==null&&'code' in error&&error.code==='23505';
async function mutate<T>(db:Db,run:(q:Q)=>Promise<T>):Promise<T> {
 try{return await db.tx(run);}
 catch(error){if(taken(error))throw new EmbaError('conflict');throw error;}
}

export async function createTeamEvent(db:Db,p:Principal,input:unknown):Promise<TeamEvent> {
 const data=team.extend({slug:nameSchema,name:title}).parse(input);
 return mutate(db,async q=>{
  await manager(q,p,data);
  await currentTeam(q,data);
  // emba_team_name rejects a slug already used by a handle, a group or another event in this namespace.
  const {rows:[row]}=await q.query<{id:string}>('insert into emba_team_event(org_id,loop_id,slug,name,created_by) values($1,$2,$3,$4,$5) returning id',[data.orgId,data.loopId,data.slug,data.name,p.personId]);
  await audit(q,p,'activity:write',row.id);
  return {id:row.id,slug:data.slug,name:data.name,archived:false};
 });
}
export async function renameTeamEvent(db:Db,p:Principal,input:unknown):Promise<void> {
 const data=z.strictObject({orgId:z.uuid(),eventId:z.uuid(),slug:nameSchema,name:title}).parse(input);
 await mutate(db,async q=>{
  const event=await owned(q,p,data.orgId,data.eventId);
  // A retired team's events can be archived but can no longer claim names.
  await currentTeam(q,event);
  if(event.archived)throw new EmbaError('conflict');
  await q.query('update emba_team_event set slug=$3,name=$4 where org_id=$1 and id=$2',[data.orgId,data.eventId,data.slug,data.name]);
  await audit(q,p,'activity:write',data.eventId);
 });
}
export async function archiveTeamEvent(db:Db,p:Principal,input:unknown):Promise<void> {
 const data=z.strictObject({orgId:z.uuid(),eventId:z.uuid()}).parse(input);
 await mutate(db,async q=>{
  await owned(q,p,data.orgId,data.eventId);
  await q.query('update emba_team_event set archived_at=coalesce(archived_at,clock_timestamp()) where org_id=$1 and id=$2',[data.orgId,data.eventId]);
  await audit(q,p,'activity:write',data.eventId);
 });
}
/** Site listing for a team's members, with the ids the manage controls need. */
export async function listTeamEvents(db:Db,p:Principal,input:unknown):Promise<TeamEvent[]> {
 const data=team.parse(input);
 return db.tx(async q=>{
  await requireFirstParty(q,p);
  if(!await canAccessLoop(q,p,data.orgId,data.loopId,'read'))throw new EmbaError('forbidden');
  const {rows}=await q.query<TeamEvent>('select id,slug,name,archived_at is not null as archived from emba_team_event where org_id=$1 and loop_id=$2 and archived_at is null order by slug limit 200',[data.orgId,data.loopId]);
  return rows;
 });
}
