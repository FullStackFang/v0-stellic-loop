import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import type {Principal} from './access';
import {audit,requireFirstParty} from './consent';
import {revokeActivityEligibility} from './activities';
import {EmbaError} from './errors';
import {releaseOnDeparture} from './team-records';

// Authentication time is a trusted provider claim, never a browser form value.
async function reauthenticated(q:Q,p:Principal) {
 await requireFirstParty(q,p);
 const at=p.authenticatedAt,now=Date.now();
 if(at===null||!Number.isFinite(at)||at>now||now-at>5*60*1000)throw new EmbaError('forbidden');
}

/** EMBA pilot export. Explicit columns keep other people's IDs out of dependencies. */
export async function exportPersonalData(db:Db,p:Principal) {
 return db.tx(async q=>{
  await reauthenticated(q,p);
  const own=async(sql:string)=>(await q.query(sql,[p.personId])).rows;
  const profile=await own('select name,phone from person where id=$1');
  const memory=await own('select m.id,m.kind,m.org_id,m.loop_id,m.current_version,v.version,v.text,v.category,v.place,v.strength,v.confidence,v.evidence_count,v.status,v.starts_at,v.ends_at,v.confirmed_at from emba_memory m join emba_memory_version v on v.memory_id=m.id and v.person_id=m.person_id where m.person_id=$1');
  const feedback=await own('select activity_id,version,attendance,assessment,memory_id,basis_version,updated_at from emba_feedback where person_id=$1');
  const commitments=await own('select activity_id,revision,min_others,status,disclose_name from emba_commitment where person_id=$1');
  const leases=await own('select id,client_id,actions,org_id,loop_id,created_at,expires_at,revoked_at from emba_lease where person_id=$1');
  const inbox=await own('select activity_id,revision,event_version,kind,created_at,acknowledged_at from emba_inbox where person_id=$1');
  const events=await own('select action,at,outcome,client_id from emba_audit where person_id=$1');
  // Shared publications remain organization-owned. Export only this person's
  // operation receipts: no withdrawn text, old versions or other authors' data.
  const groupMemoryReceipts=await own('select o.operation_id,o.record_id,o.version,o.client_id,m.status from emba_group_memory_operation o join emba_group_memory m on m.id=o.record_id where o.person_id=$1');
  // Team records: receipts, the claims this person holds or recorded, and their handle. No record text.
  const teamReceipts=await own('select o.operation_id,o.org_id,o.loop_id,r.number,r.kind,o.client_id,o.at from emba_team_operation o join emba_team_record r on r.id=o.record_id where o.person_id=$1 order by o.at');
  const teamClaims=await own(`select r.org_id,r.loop_id,r.number,r.claim_status,to_char(r.due_on,'YYYY-MM-DD') as due_on,r.owner_id=$1 as owner,coalesce(r.author_id=$1,false) as recorder,r.created_at from emba_team_record r where r.kind='claim' and (r.owner_id=$1 or r.author_id=$1) order by r.org_id,r.loop_id,r.number`);
  const handles=await own('select org_id,handle from emba_member_handle where person_id=$1 order by org_id');
  await audit(q,p,'privacy:export');
  return {scope:'emba-pilot' as const,profile,memory,feedback,commitments,leases,inbox,audit:events,groupMemoryReceipts,teamReceipts,teamClaims,handles};
 });
}

async function purge(q:Q,personId:string) {
 await q.query('select id from person where id=$1 for update',[personId]);
 await q.query('insert into emba_deletion_tombstone(person_id) values($1) on conflict do nothing',[personId]);
 await q.query('update emba_identity set revoked_at=clock_timestamp() where person_id=$1',[personId]);
 await q.query('update emba_lease set revoked_at=clock_timestamp() where person_id=$1',[personId]);
 // Include creator attribution and commitments from every revision. The later
 // cleanup updates historical dependencies too, so it must not acquire an
 // earlier activity after the eligibility hook has locked a later one.
 await q.query(`select a.id from emba_activity a where a.creator_id=$1 or exists(
  select 1 from emba_commitment c where c.activity_id=a.id
  and (c.person_id=$1 or $1=any(c.requires))) order by a.id for update of a`,[personId]);
 await revokeActivityEligibility(q,personId);
 // Suspend before removing the deleted dependency: never silently weaken a live condition.
 await q.query("update emba_commitment set status=case when status in ('active','satisfied') then 'suspended' else status end,requires=array_remove(requires,$1::uuid) where $1=any(requires)",[personId]);
 await q.query('update emba_resolution_outcome set person_id=null where person_id=$1',[personId]);
 await q.query('update emba_activity set creator_id=null where creator_id=$1',[personId]);
 // Sources belong to the organization. Attribution is erased; source text is retained.
 await q.query('update emba_document_version set uploaded_by=null where uploaded_by=$1',[personId]);
 await q.query('update emba_announcement_key set registered_by=null where registered_by=$1',[personId]);
 await q.query('update emba_team_event set created_by=null where created_by=$1',[personId]);
 // Team records stay with the team and keep their author link (shown as a former teammate). What the
 // person was holding is let go, and every other trace of them in the team's history is unlinked.
 await releaseOnDeparture(q,personId,{actorId:null});
 await q.query("update emba_team_record set owner_id=null where owner_id=$1 and kind='claim' and claim_status in ('done','released','declined')",[personId]);
 await q.query('update emba_team_record_version set edited_by=null where edited_by=$1',[personId]);
 await q.query('update emba_team_conflict set flagged_by=null where flagged_by=$1',[personId]);
 await q.query('update emba_team_brief set edited_by=null where edited_by=$1',[personId]);
 await q.query('update emba_team_change set actor_id=null where actor_id=$1',[personId]);
 await q.query('update emba_team_change set subject_id=null where subject_id=$1',[personId]);
 await q.query('update emba_team_conflict_report set person_id=null,client_id=null where person_id=$1',[personId]);
 await q.query('delete from emba_dependency_consent where target_id=$1 or requester_id=$1',[personId]);
 await q.query('delete from emba_invitation where issued_by=$1 or accepted_by=$1',[personId]);
 for(const table of ['emba_feedback','emba_feedback_operation','emba_memory','emba_document_operation','emba_group_memory_operation','emba_team_operation','emba_commitment','emba_activity_operation','emba_confirmation','emba_inbox','emba_inbox_cursor','emba_lease','emba_member_handle','emba_membership','emba_identity']) {
  await q.query(`delete from ${table} where person_id=$1`,[personId]);
 }
 // No stable participant pseudonym is retained in plan history or audit output.
 await q.query('update emba_audit set person_id=null,client_id=null,resource_id=null,lease_id=null where person_id=$1',[personId]);
}

/** Deletes EMBA records only. The shared legacy board identity remains. */
export async function deletePersonalData(db:Db,p:Principal) {
 return db.tx(async q=>{
  await q.query('select id from person where id=$1 for update',[p.personId]);
  await reauthenticated(q,p);
  await audit(q,p,'privacy:delete');
  if(p.verifiedEmail)await q.query('delete from emba_invitation where recipient_email=$1',[p.verifiedEmail]);
  await purge(q,p.personId);
  return {scope:'emba-pilot' as const,deleted:true as const,retained:['shared-public-board-identity','organization-publications'] as const};
 });
}

/** Trusted offline restore hook. Supply the external durable ledger BEFORE enabling readers/workers. */
export async function applyDeletionTombstones(db:Db,personIds:readonly string[]) {
 z.array(z.uuid()).parse(personIds);
 await db.tx(async q=>{
  for(const id of personIds)await q.query('insert into emba_deletion_tombstone(person_id) values($1) on conflict do nothing',[id]);
  const {rows}=await q.query<{person_id:string}>('select person_id from emba_deletion_tombstone order by person_id');
  for(const {person_id} of rows)await purge(q,person_id);
 });
}

/** Semantic capability expiry only. No audit/history/backup retention policy is implied. */
export async function expirePrivacyCapabilities(db:Db) {
 await db.tx(async q=>{
  for(const table of ['emba_confirmation','emba_lease','emba_inbox_cursor']) await q.query(`delete from ${table} where expires_at<=clock_timestamp()`);
 });
}
