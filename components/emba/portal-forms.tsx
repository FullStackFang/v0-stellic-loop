'use client';

import { useActionState, type ReactNode } from 'react';
import type { MemoryItem } from '@/lib/emba/memory';
import type { AccessibleLoop } from '@/lib/emba/roles';
import type { PortalAction, PortalResult } from './portal-types';

const initial: PortalResult = { status: 'idle', message: '' };

export function ActionForm({ action, children, label }: { action: PortalAction; children: ReactNode; label: string }) {
  const [state, submit, pending] = useActionState(action, initial);
  return <form action={submit} className="emba-form">
    <fieldset disabled={pending}>{children}<button className="lt-primary" type="submit">{pending ? 'Saving…' : label}</button></fieldset>
    {state.message && <p role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
    {state.invitationToken && <label>Invitation token (share privately with the recipient)<textarea readOnly value={state.invitationToken} /></label>}
    {state.confirmationId && <label>Confirmation ID<input readOnly value={state.confirmationId} /></label>}
    {state.exportJson && <button type="button" onClick={()=>{
      const url=URL.createObjectURL(new Blob([state.exportJson!],{type:'application/json'}));
      const link=document.createElement('a'); link.href=url;link.download='loop-pilot-export.json';link.click();URL.revokeObjectURL(url);
    }}>Download my pilot data</button>}
  </form>;
}

export function MemoryForm({ action, operationId, item, kind = 'want', scope = { orgId: null, loopId: null } }: { action: PortalAction; operationId: string; item?: MemoryItem; kind?: 'want' | 'intent'; scope?: { orgId: string | null; loopId: string | null } }) {
  const currentKind = item?.kind ?? kind;
  return <ActionForm action={action} label={item ? 'Save correction' : currentKind === 'intent' ? 'Save time-boxed intent' : 'Save private preference'}>
    <input type="hidden" name="operationId" value={operationId} />
    {item && <><input type="hidden" name="id" value={item.id} /><input type="hidden" name="expectedVersion" value={item.version} /></>}
    <input type="hidden" name="kind" value={currentKind} /><input type="hidden" name="orgId" value={scope.orgId ?? ''}/><input type="hidden" name="loopId" value={scope.loopId ?? ''}/>
    {currentKind === 'intent' && <><label>Starts at (UTC)<input name="startsAt" type="datetime-local" step="1" required defaultValue={item?.startsAt?.slice(0,19)}/></label><label>Ends at (UTC)<input name="endsAt" type="datetime-local" step="1" required defaultValue={item?.endsAt?.slice(0,19)}/></label></>}
    <label>Preference<textarea name="text" required maxLength={240} defaultValue={item?.text} /></label>
    <label>Category<select name="category" defaultValue={item?.category ?? 'other'}>{['food','culture','outdoors','social','rest','travel','learning','other'].map(v => <option key={v}>{v}</option>)}</select></label>
    <label>Place (optional)<input name="place" maxLength={120} defaultValue={item?.place ?? ''} /></label>
    <label>Strength (0–1)<input type="number" name="strength" min="0" max="1" step="0.1" required defaultValue={item?.strength ?? 0.5} /></label>
    <label>Status<select name="status" defaultValue={item?.status ?? 'active'}><option value="active">Active</option><option value="needs_review">Needs review</option><option value="archived">Archived</option></select></label>
    <p>This stays private. Saving does not publish an activity or commit you to a plan.</p>
  </ActionForm>;
}

export function ConnectionForm({ action, loops = [] }: { action: PortalAction; loops?: AccessibleLoop[] }) {
  return <ActionForm action={action} label="Grant selected access">
    <label>Assistant client ID<input name="clientId" required maxLength={200} /></label>
    <fieldset><legend>Allowed actions</legend>{['memory:read','plan:read','activity:write'].map(action => <label key={action} className="lt-check"><input type="checkbox" name="actions" value={action} />{action === 'memory:read' ? 'Read private preferences' : action === 'plan:read' ? 'Read trip knowledge and planning context' : 'Request activity actions (confirmation required)'}</label>)}</fieldset>
    <label>Expires at (UTC)<input name="expiresAt" type="datetime-local" required /></label>
    <label>Access context<select name="scope"><option value="personal">Personal context</option>{loops.map(loop => <option key={loop.loopId} value={`${loop.orgId}:${loop.loopId}`}>{loop.orgName} / {loop.path}</option>)}</select></label>
    <p>Select personal context or one authorized trip. Grants apply only to the selected context. Personalized planning also requires access to private preferences. Each assistant must authenticate. You can revoke access at any time.</p>
  </ActionForm>;
}

export function InvitationForm({ action, orgId, loopId }: { action: PortalAction; orgId: string; loopId: string }) {
  return <ActionForm action={action} label="Create invitation">
    <input type="hidden" name="orgId" value={orgId} /><input type="hidden" name="loopId" value={loopId} />
    <label>Recipient email<input name="recipientEmail" type="email" required /></label>
    <label>Role<select name="role"><option value="member">Member</option><option value="follower">Follower</option><option value="organizer">Organizer (owner approval required)</option></select></label>
    <label>Expires at (UTC)<input name="expiresAt" type="datetime-local" required /></label>
    <p>The invitation is bound to this email. Creating it does not send an email.</p>
  </ActionForm>;
}
