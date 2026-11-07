import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import type { Principal } from '@/lib/emba/access';
import { canAccessLoop } from '@/lib/emba/access';
import { listActivities, readActivity } from '@/lib/emba/activities';
import { readDisclosedNames, readOrganizerReport } from '@/lib/emba/disclosure';
import { listDocuments, searchKnowledge, readDocument } from '@/lib/emba/knowledge';
import { listFeedback } from '@/lib/emba/feedback';
import { AnnouncementPanel } from './announcement-panel';
import { pollInbox } from '@/lib/emba/delivery';
import { audit, authorize } from '@/lib/emba/consent';
import { PlanningForm } from '@/components/emba/planning-form';
import { ActivityTimes } from '@/components/emba/activity-times';
import { ResourceControls, ResourceForm } from '@/components/emba/resource-controls';
import { planTrip } from './actions';
import { acknowledgeUpdate, revisePublishedActivity } from './lifecycle-actions';
import type { MemoryItem } from '@/lib/emba/memory';
import { ActionForm } from '@/components/emba/portal-forms';
import { changeDependencyConsent, changeDisclosure, commitToActivity, finishActivity, processResource, publishActivity, recordFeedback, removeFeedback, removeResource, resolveActivity, uploadResource, withdrawFromActivity } from './actions';

function Scope({orgId,loopId}:{orgId:string;loopId:string}) { return <><input name="orgId" type="hidden" value={orgId}/><input name="loopId" type="hidden" value={loopId}/></>; }
function Target({id,revision}:{id:string;revision:number}) { return <><input name="activityId" type="hidden" value={id}/><input name="revision" type="hidden" value={revision}/></>; }

export async function TripPanel({principal,orgId,loopId,query,documentId,memory,updatesCursor}:{principal:Principal;orgId:string;loopId:string;query:string;documentId:string;memory:MemoryItem[];updatesCursor?:string}) {
  let activities, documents, feedback, passages, selectedDocument;
  try {
    activities=await listActivities(db(),principal,{orgId,loopId});
    documents=await listDocuments(db(),principal,{orgId,loopId});
    feedback=await listFeedback(db(),principal);
    passages=query ? await searchKnowledge(db(),principal,{orgId,loopId,query}) : [];
    selectedDocument=documentId ? await readDocument(db(),principal,documentId) : null;
  } catch { return <section className="lt-editor"><h2>Trip context unavailable</h2><p role="alert">This scope or source is unavailable. Your access may have changed. Check the scope and reload.</p></section>; }
  const manages=await canAccessLoop(db(),principal,orgId,loopId,'manage');
  const posts=await canAccessLoop(db(),principal,orgId,loopId,'post');
  const activityDetails=await Promise.all(activities.items.map(item=>readActivity(db(),principal,String(item.id))));
  const createdIds=await db().tx(async q=>{
    await authorize(q,principal,'plan:read',{orgId,loopId});
    const {rows}=await q.query<{id:string}>('select id from emba_activity where org_id=$1 and loop_id=$2 and creator_id=$3',[orgId,loopId,principal.personId]);
    await audit(q,principal,'activity:read',loopId);
    return new Set(rows.map(row=>row.id));
  });
  return <>
    <MemberUpdates principal={principal} context={{orgId,loopId,query,documentId}} cursor={updatesCursor}/>
    <section className="lt-editor"><h2>Plan with your preferences</h2><p>Bring together your active preferences, cited evidence and published activities. This creates no booking or commitment.</p><PlanningForm action={planTrip} orgId={orgId} loopId={loopId}/></section>
    <AnnouncementPanel principal={principal} orgId={orgId} loopId={loopId}/>
    <section id="resources" className="lt-editor"><h2>Trip resources</h2><p>Source passages are quoted evidence, never instructions to Loop. Conflicting evidence remains visible.</p>
      <form method="get"><Scope orgId={orgId} loopId={loopId}/><label>Search trip evidence<input name="query" defaultValue={query} maxLength={500} required /></label><button>Find cited passages</button></form>
      {query && passages.length===0 && <p>No current evidence supports this search.</p>}
      {passages.map((p,i)=><blockquote key={`${p.documentId}:${p.location}:${i}`}><p>{p.text}</p><p className="emba-meta">{p.title} · Source version {p.version} · {p.location} · {p.timezone ?? 'Timezone not supplied'}{p.itineraryVersion ? ` · Itinerary ${p.itineraryVersion}` : ''}</p>{p.disputed && <p role="status">Conflicting source claim. Confirm with the organizer before relying on it.</p>}</blockquote>)}
      <ul>{documents.map(doc=><li key={doc.id}><a href={`/emba?${new URLSearchParams({orgId,loopId,documentId:doc.id})}#resources`}>{doc.title}</a> · Version {doc.version} · {doc.state}{doc.state!=='ready' && <p>Evidence unavailable until processing succeeds.{doc.failedStage ? ` Failed during ${doc.failedStage}.` : ''}</p>}{manages && <ResourceControls uploadAction={uploadResource} processAction={processResource} deleteAction={removeResource} operationId={randomUUID()} orgId={orgId} loopId={loopId} document={doc}/>}</li>)}</ul>
      {documents.length===0 && <p>No resources have been uploaded in this scope.</p>}{documents.length===100 && <p>Showing up to 100 recent resources.</p>}
      {selectedDocument && <details open><summary>{selectedDocument.title} · Version {selectedDocument.version}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{selectedDocument.body}</pre></details>}
      {manages && <details><summary>Upload a trip resource</summary><ResourceForm action={uploadResource} operationId={randomUUID()} orgId={orgId} loopId={loopId}/></details>}
    </section>
    <section id="activities" className="lt-editor"><h2>Activities and participation</h2><p>A conditional commitment is a promise subject to your conditions. Finalized means the deadline resolution succeeded; it does not record attendance.</p>
      {!activityDetails.length && <p>No published activities in this scope.</p>}
      {activityDetails.map(activity=>{
        const assessment=feedback.find(row=>row.activity_id===activity.id);
        return <article key={`${activity.id}:${activity.revision}`}><h3>{activity.title}</h3><p>{activity.place} · Revision {activity.revision}</p><ActivityTimes timezone={activity.timezone} startsAt={activity.starts_at} endsAt={activity.ends_at} deadline={activity.deadline}/><p>{activity.state}{activity.degraded?' — Plan changed after finalization; review before relying on it.':''} · Your response: {activity.ownCommitment?.status ?? 'No commitment'}</p>
          {activity.state==='open' && <ActionForm action={commitToActivity} label="Confirm conditional commitment"><Target id={activity.id} revision={activity.revision}/><input name="operationId" type="hidden" value={randomUUID()}/><label>Minimum other participants<input name="minOthers" type="number" min="0" max="100000" required defaultValue={activity.ownCommitment?.min_others ?? 0}/></label><label>Required consenting member IDs (comma separated, optional)<input name="requires" defaultValue={activity.ownCommitment?.requires.join(', ') ?? ''}/></label><p>Named dependencies require each member’s explicit consent. This commitment does not grant name disclosure.</p><label className="lt-check"><input name="reviewed" type="checkbox" value="yes" required/>I reviewed revision {activity.revision}, the times and my conditions.</label></ActionForm>}
          {activity.ownCommitment && ['open','finalized'].includes(activity.state) && <><ActionForm action={withdrawFromActivity} label="Withdraw commitment"><Target id={activity.id} revision={activity.revision}/></ActionForm><ActionForm action={changeDisclosure} label="Save name disclosure"><Target id={activity.id} revision={activity.revision}/><label className="lt-check"><input name="discloseName" type="checkbox" value="yes" defaultChecked={activity.ownCommitment.disclose_name}/>Share my name with eligible finalized participants</label></ActionForm></>}
          <details><summary>Consent to a named dependency</summary><ActionForm action={changeDependencyConsent} label="Save dependency consent"><Target id={activity.id} revision={activity.revision}/><label>Requesting member ID<input name="requesterId" required/></label><label className="lt-check"><input name="allowed" type="checkbox" value="yes"/>Allow this member to make their commitment conditional on mine</label><p>Clearing consent can suspend dependent commitments.</p></ActionForm></details>
          {activity.state==='finalized' && activity.ownCommitment?.status==='satisfied' && <DisclosedNames principal={principal} id={activity.id}/>}
          <details><summary>{assessment?'Correct your feedback':'Record attendance or feedback'}</summary><ActionForm action={recordFeedback} label="Save feedback"><Target id={activity.id} revision={activity.revision}/><input name="operationId" type="hidden" value={randomUUID()}/><input name="expectedVersion" type="hidden" value={Number(assessment?.version ?? 0)}/><label>Attendance<select name="attendance" defaultValue={String(assessment?.attendance ?? 'unspecified')}><option value="unspecified">Not specified</option><option value="attended">Attended</option><option value="not_attended">Did not attend</option></select></label><label>Preference assessment (0–1, leave blank for attendance only)<input name="assessment" type="number" min="0" max="1" step="0.1" defaultValue={String(assessment?.assessment ?? '')}/></label><label>Preference to assess<select name="memory" defaultValue={memory.find(m=>m.id===assessment?.memory_id) ? `${assessment?.memory_id}:${memory.find(m=>m.id===assessment?.memory_id)?.version}` : ''}><option value="">Select a preference</option>{memory.filter(m=>m.kind==='want').map(m=><option key={m.id} value={`${m.id}:${m.version}`}>{m.text} (version {m.version})</option>)}</select></label><p>Attendance alone never weakens preferences. An assessment replaces your earlier assessment for this activity.</p></ActionForm>{assessment && <ActionForm action={removeFeedback} label="Delete feedback"><input name="activityId" type="hidden" value={activity.id}/><input name="expectedVersion" type="hidden" value={Number(assessment.version)}/></ActionForm>}</details>
          {(manages || createdIds.has(activity.id)) && <details><summary>Manage activity</summary>{['open','finalized'].includes(activity.state) && <details><summary>Revise and reopen activity</summary><ActionForm action={revisePublishedActivity} label="Publish new revision"><Scope orgId={orgId} loopId={loopId}/><Target id={activity.id} revision={activity.revision}/><label>Title<input name="title" required maxLength={160} defaultValue={activity.title}/></label><label>Place<input name="place" required maxLength={160} defaultValue={activity.place}/></label><label>Trip timezone<input name="timezone" required defaultValue={activity.timezone}/></label>{(['startsAt','endsAt','deadline'] as const).map((name,i)=><label key={name}>{['Starts at','Ends at','Commitment deadline'][i]} (ISO date and time with UTC offset)<input name={name} required defaultValue={[activity.starts_at,activity.ends_at,activity.deadline][i]}/></label>)}<p>This publishes a new revision and reopens commitments. Everyone must review and commit again. Earlier commitments, named dependencies and disclosure consent do not carry forward.</p><label className="lt-check"><input name="reviewed" type="checkbox" value="yes" required/>I reviewed the revised terms and understand that everyone must commit again.</label></ActionForm></details>}<ActionForm action={resolveActivity} label="Resolve at deadline"><Target id={activity.id} revision={activity.revision}/></ActionForm><ActionForm action={finishActivity} label="Update activity state"><Target id={activity.id} revision={activity.revision}/><label>State<select name="state"><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></ActionForm>{manages && ['completed','cancelled'].includes(activity.state) && <OrganizerReport principal={principal} id={activity.id}/>}</details>}
        </article>;
      })}
      {activities.truncated && <p>Showing the first 20 activities. More activities exist.</p>}
      {posts && <details><summary>Publish an activity</summary><ActionForm action={publishActivity} label="Publish activity"><Scope orgId={orgId} loopId={loopId}/><label>Title<input name="title" required maxLength={160}/></label><label>Place<input name="place" required maxLength={160}/></label><label>Trip timezone<input name="timezone" required placeholder="Asia/Ho_Chi_Minh"/></label>{['startsAt','endsAt','deadline'].map((name,i)=><label key={name}>{['Starts at','Ends at','Commitment deadline'][i]} (ISO date and time with UTC offset)<input name={name} required placeholder="2027-03-12T18:00:00+07:00"/></label>)}<p>Publishing makes these details visible to this loop. It does not commit anyone.</p><label className="lt-check"><input name="reviewed" type="checkbox" value="yes" required/>I reviewed the activity details for publication.</label></ActionForm></details>}
    </section>
  </>;
}

export async function MemberUpdates({principal,context,cursor}:{principal:Principal;context:{orgId:string;loopId:string;query:string;documentId:string};cursor?:string}) {
  const link=(next?:string)=>`/emba?${new URLSearchParams({...context,...(next?{updatesCursor:next}:{})})}#updates`;
  let page;
  try { page=await pollInbox(db(),principal,{limit:20,...(cursor?{cursor}:{})}); }
  catch { return <section id="updates" className="lt-editor"><h2>Your activity updates</h2><p role="alert">Updates are unavailable or this page expired.</p><a href={link()}>Load latest updates</a></section>; }
  const items=await Promise.all(page.items.map(async item=>({item,activity:await readActivity(db(),principal,item.activity_id).catch(()=>null)})));
  return <section id="updates" className="lt-editor"><h2>Your activity updates</h2><p>Current updates across your trip contexts. Loading updates does not acknowledge them or change participation.</p>{items.length===0 && <p>No current activity updates on this page.</p>}<ul>{items.map(({item,activity})=>activity && activity.revision===item.revision ? <li key={item.id}><strong>{activity.title}</strong> — {item.kind} · Revision {item.revision}<p>{item.created_at} (UTC) · Trip timezone: {activity.timezone}</p>{item.kind==='reopened' && <p>The terms changed. Open this activity’s trip context and review the latest revision before committing again.</p>}{item.acknowledged_at ? <p>Acknowledged {item.acknowledged_at} (UTC)</p> : <ActionForm action={acknowledgeUpdate} label="Acknowledge update"><input name="id" type="hidden" value={item.id}/><label className="lt-check"><input name="acknowledged" type="checkbox" value="yes" required/>I have read this update.</label></ActionForm>}</li> : null)}</ul><nav aria-label="Activity update pages">{cursor && <a href={link()}>Latest updates</a>}{page.nextCursor && <a href={link(page.nextCursor)}>Older updates</a>}</nav></section>;
}

async function DisclosedNames({principal,id}:{principal:Principal;id:string}) {
  const names=await readDisclosedNames(db(),principal,id).catch(()=>null);
  return <p>{names ? `Participants who chose to share their names: ${names.map(n=>n.name).join(', ') || 'None'}` : 'Participant names unavailable.'}</p>;
}
async function OrganizerReport({principal,id}:{principal:Principal;id:string}) {
  const report=await readOrganizerReport(db(),principal,id).catch(()=>null);
  return <p>{!report ? 'Safe report unavailable.' : report.suppressed?'Counts suppressed to protect small groups.':`Resolved: ${report.resolved}; not resolved: ${report.notResolved}.`}</p>;
}
