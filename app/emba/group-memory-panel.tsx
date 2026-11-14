import {randomUUID} from 'node:crypto';
import {db,type Db} from '@/lib/db';
import {canAccessLoop,type Principal} from '@/lib/emba/access';
import {requireFirstParty} from '@/lib/emba/consent';
import {canManageGroupAddress,listPortalGroups} from '@/lib/emba/groups';
import {searchGroupMemory} from '@/lib/emba/group-memory';
import {ActionForm} from '@/components/emba/portal-forms';
import {GroupNoteReview} from '@/components/emba/group-note-review';
import {GroupConnection} from '@/components/emba/group-connection';
import {authConfig} from '@/lib/emba/auth-token';
import {saveSharedNote,withdrawSharedNote,registerSharedGroup,reviewSharedNote,approveSharedNote,connectGroupAssistant} from './group-memory-actions';
export async function GroupMemoryPanel({principal:p,orgId,loopId}:{principal:Principal;orgId:string;loopId:string}){
 try{
  return await db().tx(async q=>{
  // Keep handle, authority and note-version locks through the composed snapshot.
  const database:Db={...q,tx:fn=>fn(q)};
  const scope={orgId,loopId},groups=await listPortalGroups(database,p),group=groups.find(g=>g.orgId===orgId&&g.loopId===loopId);
  const permissions=await database.tx(async q=>{await requireFirstParty(q,p);return {post:await canAccessLoop(q,p,orgId,loopId,'post'),manage:await canAccessLoop(q,p,orgId,loopId,'manage'),owner:await canManageGroupAddress(q,p,scope)};});
  const notes=await searchGroupMemory(database,p,scope);
  await requireFirstParty(q,p);if(!await canAccessLoop(q,p,orgId,loopId,'read'))throw new Error('Unavailable');
  const scopeFields=<><input type="hidden" name="orgId" value={orgId}/><input type="hidden" name="loopId" value={loopId}/></>;
  let connection;try{connection=authConfig();}catch{connection=null;}
  return <section id="shared-memory" className="lt-editor"><h2>Shared group notes</h2><p>Notes are visible to authorized group members. Your private preferences are kept separately. Publishing a note does not establish a group decision or send anyone a message.</p>
   {group?<p>In your connected assistant, refer to <strong>{group.handle}</strong>. A short @{group.slug} may need clarification if more than one group matches.</p>:<p>This group has no assistant handle yet.</p>}
   {connection&&<GroupConnection clients={[...connection.clientIds]} endpoint={connection.audience} orgId={orgId} loopId={loopId} action={connectGroupAssistant}/>}
   {!group&&permissions.owner&&<details><summary>Register a group handle</summary><p>A root owner can register an immutable handle. Names do not imply institutional endorsement.</p><ActionForm action={registerSharedGroup} label="Register handle">{scopeFields}<label>Organization namespace<input name="namespace" pattern="[a-z0-9][a-z0-9\-]{1,47}" required maxLength={48}/></label><label>Group name<input name="slug" pattern="[a-z0-9][a-z0-9\-]{1,47}" placeholder="emba2027" required maxLength={48}/></label></ActionForm></details>}
   {notes.items.length===0&&<p>No shared notes yet.</p>}{notes.items.map(note=><article key={note.id}><p>{note.text}</p><p className="emba-meta">Member submission · Version {note.version} · {note.publishedAt}</p>{permissions.post&&(permissions.manage||note.authorId===p.personId)&&<details><summary>Correct or withdraw note</summary><ActionForm action={saveSharedNote} label="Publish correction">{scopeFields}<input type="hidden" name="recordId" value={note.id}/><input type="hidden" name="expectedVersion" value={note.version}/><input type="hidden" name="operationId" value={randomUUID()}/><label>Corrected note<textarea name="text" maxLength={2000} required defaultValue={note.text}/></label><label><input type="checkbox" name="reviewed" value="yes" required/>Share this correction with the group.</label></ActionForm><ActionForm action={withdrawSharedNote} label="Withdraw note">{scopeFields}<input type="hidden" name="recordId" value={note.id}/><input type="hidden" name="expectedVersion" value={note.version}/><input type="hidden" name="operationId" value={randomUUID()}/><label><input type="checkbox" name="reviewed" value="yes" required/>Remove this note from future reads. Earlier copies cannot be recalled.</label></ActionForm></details>}</article>)}
   {notes.truncated&&<p>Showing a limited selection. Use the assistant search to find other notes.</p>}
   {permissions.post&&<><details><summary>Add a shared note</summary><ActionForm action={saveSharedNote} label="Publish shared note">{scopeFields}<input type="hidden" name="operationId" value={randomUUID()}/><label>Note<textarea name="text" maxLength={2000} required/></label><label><input type="checkbox" name="reviewed" value="yes" required/>Publish this text for authorized group members.</label></ActionForm></details><details><summary>Review a note from your assistant</summary><GroupNoteReview reviewAction={reviewSharedNote} approveAction={approveSharedNote}/></details></>}
  </section>;
  });
 }catch{return <section className="lt-editor"><h2>Shared group notes unavailable</h2><p>Your access may have changed. Reload to try again.</p></section>;}
}
