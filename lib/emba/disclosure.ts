import 'server-only';
import { z } from 'zod';
import type { Db,Q } from '../db';
import { canAccessLoop,type Principal } from './access';
import { audit,authorize,requireFirstParty } from './consent';
import { lockAuthorizedActivity, eligibleActivityParticipant } from './activities';
import { EmbaError } from './errors';

export const disclosureSchema=z.strictObject({activityId:z.uuid(),revision:z.number().int().positive(),discloseName:z.boolean()});
/** Invoke only after first-party review or inside a consumeConfirmation callback. */
export async function setNameDisclosureInTransaction(q:Q,p:Principal,input:unknown) {
  const d=disclosureSchema.parse(input),a=await lockAuthorizedActivity(q,p,d.activityId,'commit');
  const lease=await authorize(q,p,'activity:write',{orgId:a.org_id,loopId:a.loop_id});
  if(!await canAccessLoop(q,p,a.org_id,a.loop_id,'commit'))throw new EmbaError('forbidden');
  if(a.revision!==d.revision)throw new EmbaError('conflict');
  const {rows}=await q.query(`update emba_commitment set disclose_name=$4 where activity_id=$1 and revision=$2 and person_id=$3 and status in ('active','satisfied') returning person_id`,[a.id,a.revision,p.personId,d.discloseName]);
  if(!rows.length)throw new EmbaError('forbidden');
  await audit(q,p,'activity:disclosure',a.id,lease);return {id:a.id,revision:a.revision};
}
export async function setNameDisclosure(db:Db,p:Principal,input:unknown) {return db.tx(async q=>{await requireFirstParty(q,p);return setNameDisclosureInTransaction(q,p,input);});}
export async function readDisclosedNames(db:Db,p:Principal,id:string) {
  return db.tx(async q=>{
    const a=await lockAuthorizedActivity(q,p,id,'commit');const lease=await authorize(q,p,'plan:read',{orgId:a.org_id,loopId:a.loop_id});
    if(!await canAccessLoop(q,p,a.org_id,a.loop_id,'commit'))throw new EmbaError('forbidden');
    const {rows:own}=await q.query("select 1 from emba_commitment where activity_id=$1 and revision=$2 and person_id=$3 and status='satisfied'",[id,a.revision,p.personId]);
    if(!own.length||a.state!=='finalized')throw new EmbaError('forbidden');
    const {rows}=await q.query<{name:string;person_id:string}>(`select p.name,c.person_id from emba_commitment c join person p on p.id=c.person_id
      where c.activity_id=$1 and c.revision=$2 and c.status='satisfied' and c.disclose_name order by p.name`,[id,a.revision]);
    const names=[];
    for(const row of rows) if(await eligibleActivityParticipant(q,a,row.person_id))names.push({name:row.name});
    await audit(q,p,'activity:names',id,lease);return names;
  });
}
export async function readOrganizerReport(db:Db,p:Principal,id:string) {
  return db.tx(async q=>{
    await requireFirstParty(q,p);const a=await lockAuthorizedActivity(q,p,id,'manage');
    if(!await canAccessLoop(q,p,a.org_id,a.loop_id,'manage'))throw new EmbaError('forbidden');
    const {rows:[report]}=await q.query<{report:{suppressed:boolean;resolved?:number;notResolved?:number}}>('select report from emba_activity_report where activity_id=$1',[id]);
    if(!report)throw new EmbaError('unavailable');
    await audit(q,p,'activity:report',id);return report.report;
  });
}
