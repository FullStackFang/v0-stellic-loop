import { randomUUID } from 'node:crypto';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { ActionForm, ConnectionForm, InvitationForm, MemoryForm } from '@/components/emba/portal-forms';
import { readOrganizerInvitations, readPortalData } from './data';
import { cancelInvitation, createInvitation, grantConnection, redeemInvitation, revokeConnection, savePreference } from './actions';
import { approveAssistantAction, reviewAssistantAction, exportPilotData, deletePilotData } from './actions';
import { AssistantReview } from '@/components/emba/assistant-review';
import { TripPanel } from './trip-panel';
import { listMyLoops, listOrganizationMembers, listScopedRoles } from '@/lib/emba/roles';
import { db } from '@/lib/db';
import { RolesPanel } from '@/components/emba/RolesPanel';
import { grantScopedRole, removeOrgMembership, revokeScopedRole } from './role-actions';
import type { MemoryItem } from '@/lib/emba/memory';
import { readScopedMemory } from './data';
import { MemoryProposalReview } from '@/components/emba/memory-proposal-review';
import { acceptWantProposal, reviewWantProposal } from './memory-review-actions';
import { PrivacyControls } from '@/components/emba/privacy-controls';
import { InvitationAcceptance, InvitationRevoke } from '@/components/emba/invitation-controls';
import { canAccessLoop } from '@/lib/emba/access';
import { requireFirstParty } from '@/lib/emba/consent';

export const dynamic = 'force-dynamic';

export default async function MemberPortal({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Your member space</h1><h2>Sign-in is not configured yet</h2><p>Private preferences, assistant access and invitations will be available here after secure member sign-in is connected.</p><p>No member data is loaded. If you received an invitation, keep it private and return when your organizer confirms sign-in is ready.</p></section>;
  let data;
  try { data = await readPortalData(principal); }
  catch { return <section className="lt-editor"><h1>Member space unavailable</h1><p role="alert">Your session or access may have expired or been revoked, or the service may be temporarily unavailable. No private data is shown.</p><a href="/emba">Try again</a></section>; }
  const params = await searchParams;
  let loops = await listMyLoops(db(), principal).catch(() => []);
  const selected = loops.find(loop => `${loop.orgId}:${loop.loopId}` === params.scope || (loop.orgId === params.orgId && loop.loopId === params.loopId)) ?? loops[0];
  const orgId = selected?.orgId ?? '';
  const loopId = selected?.loopId ?? '';
  let invitations = orgId && loopId ? await readOrganizerInvitations(principal,orgId,loopId).catch(() => null) : null;
  let scopedRoles = orgId && loopId ? await listScopedRoles(db(),principal,orgId,loopId).catch(() => null) : null;
  let organizationMembers = selected && !selected.path.includes('/') && scopedRoles ? await listOrganizationMembers(db(),principal,orgId,loopId).catch(() => null) : null;
  const contextMemory = selected ? await readScopedMemory(principal,orgId,loopId).catch(() => null) : null;
  // Later asynchronous reads must not release organizer data loaded under a
  // grant that has since been removed. Mutations still authorize independently.
  try {
    loops = await listMyLoops(db(),principal);
    const manages = await db().tx(async q => {
      await requireFirstParty(q,principal);
      if (!selected) return false;
      if (!await canAccessLoop(q,principal,orgId,loopId,'read')) throw new Error('Scope unavailable');
      return canAccessLoop(q,principal,orgId,loopId,'manage');
    });
    if (!manages) { invitations=null;scopedRoles=null;organizationMembers=null; }
  } catch {
    return <section className="lt-editor"><h1>Member space unavailable</h1><p role="alert">Your session or access may have expired or been revoked, or the service may be temporarily unavailable. No private data is shown.</p><a href="/emba">Try again</a></section>;
  }
  return <>
    <h1>Your plans start with you.</h1><p>Keep your preferences private, choose what assistants can access, and review what happened.</p>
    <nav aria-label="Member sections"><a href="#trip">Trip context</a><a href="#memory">Private preferences</a>{selected && <a href="#context-memory">Trip preferences</a>}<a href="#memory-proposals">Proposal review</a><a href="#connections">Assistant access</a><a href="#audit">Access history</a><a href="#invitations">Invitations</a>{scopedRoles && <a href="#roles">Membership</a>}</nav>
    <section id="trip" className="lt-editor"><h2>Open a trip context</h2>{loops.length > 0 ? <form method="get"><label>Trip context<select name="scope" defaultValue={`${orgId}:${loopId}`}>{loops.map(loop => <option key={loop.loopId} value={`${loop.orgId}:${loop.loopId}`}>{loop.orgName} / {loop.path}</option>)}</select></label><button>Open trip context</button></form> : <p>You have no active trip contexts yet. Accept an invitation to join one.</p>}</section>
    {orgId && loopId && <TripPanel principal={principal} orgId={orgId} loopId={loopId} query={typeof params.query==='string'?params.query:''} documentId={typeof params.documentId==='string'?params.documentId:''} updatesCursor={typeof params.updatesCursor==='string'?params.updatesCursor:undefined} memory={[...data.memory.items,...(contextMemory?.items ?? [])]}/>}
    <MemoryEditor id="memory" title="Private preferences" description="Personal context across trips. Review-needed, archived and expired items are excluded from ordinary planning." memory={data.memory} scope={{orgId:null,loopId:null}}/>
    {selected && (contextMemory ? <MemoryEditor id="context-memory" title={`Trip preferences: ${selected.orgName} / ${selected.path}`} description="Only this trip context can use these private preferences. They stay yours and are not visible to organizers." memory={contextMemory} scope={{orgId,loopId}}/> : <section id="context-memory" className="lt-editor"><h2>Trip preferences unavailable</h2><p>Your access may have changed. Reload to check this trip context.</p></section>)}
    <section id="memory-proposals" className="lt-editor"><h2>Review a structured want proposal</h2><p>A proposed want is temporary. Loop compares it with your current version and saves it only after you accept it.</p><MemoryProposalReview reviewAction={reviewWantProposal} acceptAction={acceptWantProposal}/></section>
    <section id="connections" className="lt-editor"><h2>Assistant access</h2><p>Only you can grant access. Revoking a connection blocks its subsequent requests; it cannot recall information already delivered to an assistant.</p>
      {data.leases.length === 0 && <p>No assistant connections.</p>}
      <ul>{data.leases.map(lease => { const status = lease.revoked_at ? 'Revoked' : Date.parse(String(lease.expires_at)) <= data.loadedAt ? 'Expired' : 'Active'; const context = loops.find(loop => loop.orgId === lease.org_id && loop.loopId === lease.loop_id); return <li key={String(lease.id)}><strong>{String(lease.client_id)}</strong> — {status}<p>{(lease.actions as string[]).join(', ')} · Expires {String(lease.expires_at)} (UTC)</p><p className="emba-meta">{lease.loop_id ? context ? `${context.orgName} / ${context.path}` : 'Trip context no longer available' : 'Personal context'}</p>{status === 'Active' && <ActionForm action={revokeConnection} label="Revoke access"><input type="hidden" name="id" value={String(lease.id)} /></ActionForm>}</li>; })}</ul>
      {data.leases.length === 100 && <p>Showing at most 100 recent connections.</p>}
      <details><summary>Grant assistant access</summary><ConnectionForm action={grantConnection} loops={loops}/></details>
      <details><summary>Review an assistant action</summary><AssistantReview reviewAction={reviewAssistantAction} approveAction={approveAssistantAction}/></details>
    </section>
    <section id="audit" className="lt-editor"><h2>Access history</h2><p>Recent actions on your data, without conversation content or credentials.</p>{data.events.length === 0 && <p>No recorded actions.</p>}<ul>{data.events.map(event => <li key={String(event.id)}><strong>{String(event.action)}</strong> — {String(event.outcome)}<p className="emba-meta">{event.client_id ? String(event.client_id) : 'You, through Loop'} · {String(event.at)} (UTC)</p></li>)}</ul><p className="emba-meta">Showing up to 100 recent events.</p></section>
    <section id="invitations" className="lt-editor"><h2>Invitations</h2><InvitationAcceptance action={redeemInvitation}/>
      <h3>Organizer invitations</h3><p>Select a trip context above to manage invitations. Your current role is checked before anything is shown or changed.</p>
      {orgId && loopId && invitations === null && <p role="alert">This organizer scope is unavailable or your access has been revoked.</p>}
      {invitations && <><InvitationForm action={createInvitation} orgId={orgId} loopId={loopId} /><ul>{invitations.map(invite => <li key={invite.id}>{invite.recipient_email} — {invite.role} — {invite.accepted_at ? 'Accepted' : invite.revoked_at ? 'Revoked' : Date.parse(invite.expires_at) <= data.loadedAt ? 'Expired' : 'Pending'}{!invite.accepted_at && !invite.revoked_at && <InvitationRevoke action={cancelInvitation} id={invite.id}/>}</li>)}</ul></>}
    </section>
    {scopedRoles && selected && <RolesPanel orgId={orgId} loopId={loopId} personId={principal.personId} roles={scopedRoles} organizationMembers={organizationMembers} grantAction={grantScopedRole} revokeAction={revokeScopedRole} removeAction={removeOrgMembership}/>}
    <PrivacyControls exportAction={exportPilotData} deleteAction={deletePilotData}/>
  </>;
}

function MemoryEditor({ id, title, description, memory, scope }: { id: string; title: string; description: string; memory: { items: MemoryItem[]; truncated: boolean }; scope: { orgId: string | null; loopId: string | null } }) {
  return <section id={id} className="lt-editor"><h2>{title}</h2><p>{description}</p>
    {memory.items.length === 0 && <p>You have no saved preferences here yet.</p>}
    {memory.items.map(item => <details key={`${item.id}:${item.version}`}><summary>{item.text} — {item.status}</summary><p className="emba-meta">{item.kind === 'want' ? 'Persistent want' : 'Time-boxed intent'} · Version {item.version} · {item.evidenceCount} evidence observations · Confidence {item.confidence}</p><p className="emba-meta">Confirmed {item.confirmedAt}{item.endsAt ? ` · Ends ${item.endsAt} (UTC)` : ''}</p><MemoryForm action={savePreference} item={item} operationId={randomUUID()} scope={scope}/></details>)}
    {memory.truncated && <p role="status">Showing the latest 100 preferences. This list is incomplete.</p>}
    <details><summary>Add a private preference</summary><MemoryForm action={savePreference} operationId={randomUUID()} scope={scope}/></details>
    <details><summary>Add a time-boxed intent</summary><MemoryForm action={savePreference} operationId={randomUUID()} kind="intent" scope={scope}/></details>
  </section>;
}
