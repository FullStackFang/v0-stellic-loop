import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ActionForm, MemoryForm, ConnectionForm, InvitationForm } from '../../components/emba/portal-forms';
import { InvitationAcceptance, InvitationRevoke } from '../../components/emba/invitation-controls';
import { ResourceControls, ResourceForm } from '../../components/emba/resource-controls';
import { RolesPanel } from '../../components/emba/RolesPanel';
import { AssistantReview } from '../../components/emba/assistant-review';
import { MemoryProposalReview } from '../../components/emba/memory-proposal-review';
import { PrivacyControls } from '../../components/emba/privacy-controls';
import type { PortalAction } from '../../components/emba/portal-types';
import type { readOrganizerInvitations, readPortalData } from '../../app/emba/data';
import type { AccessibleLoop, OrganizationMember, ScopedRole } from '../../lib/emba/roles';
import type { readActivity } from '../../lib/emba/activities';
import type { KnowledgePassage, listDocuments } from '../../lib/emba/knowledge';
import '../../app/globals.css';
import '../../components/TripView.css';
import '../../app/emba/portal.css';
import './font.css';

type State=Awaited<ReturnType<typeof readPortalData>>&{loops:AccessibleLoop[];activity:Awaited<ReturnType<typeof readActivity>>|null;passages:KnowledgePassage[];documents:Awaited<ReturnType<typeof listDocuments>>;invitations:Awaited<ReturnType<typeof readOrganizerInvitations>>;scope:{orgId:string;loopId:string};capability:string;personId:string;rootId:string;rootRoles:ScopedRole[]|null;tripRoles:ScopedRole[]|null;organizationMembers:OrganizationMember[]|null};
function Harness(){
  const [roleContext,setRoleContext]=useState('trip');
  const [actor,setActor]=useState('memberA'),[state,setState]=useState<State|null>(null),[message,setMessage]=useState(''),[editing,setEditing]=useState<string|null>(null),[binding,setBinding]=useState(''),[unavailable,setUnavailable]=useState(false);
  const refresh=async()=>{const response=await fetch(`/__fixture/state?actor=${actor}`);if(!response.ok){setUnavailable(true);return;}setState(await response.json());};
  useEffect(()=>{let current=true;void fetch(`/__fixture/state?actor=${actor}`).then(async response=>({ok:response.ok,data:await response.json()})).then(({ok,data})=>{if(current){if(ok)setState(data);else setUnavailable(true);}});return()=>{current=false;};},[actor]);
  async function request(path:string,data:unknown){const response=await fetch(`/__fixture/${path}?actor=${actor}`,{method:'POST',headers:{'Content-Type':'application/json','X-Rehearsal-Capability':state!.capability},body:JSON.stringify(data)});return response.json();}
  const action=(name:string):PortalAction=>async(_previous,form)=>{const result=await request('action',{action:name,entries:[...form.entries()]});if(name==='deletePilotData')setMessage(result.message);await refresh();return result;};
  const changeActor=(value:string)=>{setActor(value);setState(null);setUnavailable(false);setEditing(null);setBinding('');setMessage('');};
  const selector=<label>Synthetic actor<select value={actor} onChange={e=>changeActor(e.target.value)}><option value="memberA">Member A</option><option value="memberB">Member B</option><option value="organizer">Organizer</option><option value="nonmember">Nonmember</option><option value="owner">Synthetic owner</option></select></label>;
  if(unavailable)return <main><h1>Pilot access unavailable</h1><p role="status">{message||'This synthetic identity has no current pilot access.'}</p>{selector}</main>;
  if(!state)return <p>Loading synthetic fixture…</p>;
  const item=state.memory.items.find(m=>m.id===editing);
  return <div className="lt-trip emba-portal"><main className="lt-main" data-person-id={state.personId}><h1>Synthetic component rehearsal</h1><p>Local disposable data. Real portal components and actions; synthetic identity and test transport.</p>{selector}
    <section className="lt-editor"><h2>Private preferences</h2><ul>{state.memory.items.map(m=><li key={m.id}>{m.text} · Version {m.version}<button onClick={()=>setEditing(m.id)}>Correct preference</button></li>)}</ul><MemoryForm key={`${actor}:${editing??'new'}`} action={action('savePreference')} operationId={crypto.randomUUID()} item={item}/></section>
    <section className="lt-editor" id="proposals"><h2>Review a structured want</h2><MemoryProposalReview key={actor} reviewAction={action('reviewWantProposal')} acceptAction={action('acceptWantProposal')}/></section>
    <section className="lt-editor"><h2>Assistant access</h2><ConnectionForm action={action('grantConnection')} loops={state.loops}/><ul>{state.leases.map(lease=><li key={String(lease.id)}>{String(lease.client_id)} — {lease.revoked_at?'Revoked':'Active'}{!lease.revoked_at&&<ActionForm action={action('revokeConnection')} label="Revoke access"><input name="id" type="hidden" value={String(lease.id)}/></ActionForm>}</li>)}</ul><button onClick={async()=>{const result=await request('assistant-read',{});setMessage(result.error??JSON.stringify(result));}}>Try delegated preference read</button></section>
    <section className="lt-editor"><h2>Trip evidence</h2>{state.passages.length?state.passages.map(p=><blockquote key={`${p.documentId}:${p.location}`}>{p.text}<p>{p.title} · Version {p.version} · {p.timezone}</p></blockquote>):<p>No authorized trip evidence.</p>}</section>
    <section className="lt-editor"><h2>Participation</h2>{state.activity?<><h3>{state.activity.title}</h3><p>{state.activity.starts_at} (UTC) · Trip timezone: {state.activity.timezone} · Revision {state.activity.revision}</p><p>Your commitment: {state.activity.ownCommitment?.status??'none'}</p><ActionForm action={action('withdrawFromActivity')} label="Withdraw commitment"><input name="activityId" type="hidden" value={state.activity.id}/><input name="revision" type="hidden" value={state.activity.revision}/></ActionForm><button onClick={async()=>{const result=await request('prepare',{});setBinding(result.review?JSON.stringify(result.review):'');setMessage(result.error??'Prepared for review.');}}>Prepare assistant commitment</button></>:<p>No authorized activity.</p>}
    {binding&&<label>Prepared binding<textarea readOnly value={binding}/></label>}<AssistantReview key={actor} reviewAction={action('reviewAssistantAction')} approveAction={action('approveAssistantAction')}/><button onClick={async()=>{await request('advance-revision',{});await refresh();setMessage('Fixture revision advanced.');}}>Advance fixture revision</button></section><p role="status" data-testid="rehearsal-result">{message}</p>
    <section className="lt-editor"><h2>Synthetic authentication controls</h2><p>These controls change a trusted synthetic verifier claim; they are not production sign-in.</p><button onClick={async()=>{await request('authentication-age',{mode:'fresh'});setMessage('Synthetic authentication refreshed.');}}>Refresh synthetic authentication</button><button onClick={async()=>{await request('authentication-age',{mode:'expired'});setMessage('Synthetic authentication expired.');}}>Expire synthetic authentication</button></section>
    <section className="lt-editor" id="invitations"><h2>Invitations</h2><InvitationAcceptance key={actor} action={action('redeemInvitation')}/>{state.invitations&&<><InvitationForm action={action('createInvitation')} {...state.scope}/><ul>{state.invitations.map(invite=><li key={invite.id} data-invitation-id={invite.id}>{invite.recipient_email} - {invite.accepted_at?'Accepted':invite.revoked_at?'Revoked':Date.parse(invite.expires_at)<=state.loadedAt?'Expired':'Pending'}{!invite.accepted_at&&!invite.revoked_at&&<InvitationRevoke action={action('cancelInvitation')} id={invite.id}/>}</li>)}</ul></>}</section>
    <section className="lt-editor" id="resources"><h2>Resource management</h2>{state.invitations&&<div id="upload-resource"><ResourceForm action={action('uploadResource')} operationId={crypto.randomUUID()} {...state.scope}/></div>}<ul>{state.documents.map(doc=><li key={`${doc.id}:${doc.version}`} data-document-id={doc.id}><h3>{doc.title}</h3><p>Version {doc.version} - {doc.state}{doc.failedStage?` - ${doc.failedStage}`:''}</p>{state.invitations&&<ResourceControls uploadAction={action('uploadResource')} processAction={action('processResource')} deleteAction={action('removeResource')} operationId={crypto.randomUUID()} {...state.scope} document={doc}/>}</li>)}</ul></section>
    <label>Synthetic role context<select value={roleContext} onChange={e=>setRoleContext(e.target.value)}><option value="trip">Vietnam child trip</option><option value="root">Organization root</option></select></label>
    {(roleContext==='root'?state.rootRoles:state.tripRoles)?<RolesPanel key={`${actor}:${roleContext}`} orgId={state.scope.orgId} loopId={roleContext==='root'?state.rootId:state.scope.loopId} personId={state.personId} roles={(roleContext==='root'?state.rootRoles:state.tripRoles)!} organizationMembers={roleContext==='root'?state.organizationMembers:null} grantAction={action('grantScopedRole')} revokeAction={action('revokeScopedRole')} removeAction={action('removeOrgMembership')}/>:<p>Membership administration unavailable.</p>}
    <PrivacyControls key={`privacy:${actor}`} exportAction={action('exportPilotData')} deleteAction={action('deletePilotData')}/>
    </main></div>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
