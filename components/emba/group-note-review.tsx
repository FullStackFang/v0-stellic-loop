'use client';
import {useActionState} from 'react';
import type {PortalAction,PortalResult} from './portal-types';
import {ActionForm} from './portal-forms';
export function GroupNoteReview({reviewAction,approveAction}:{reviewAction:PortalAction;approveAction:PortalAction}){
 const [state,submit,pending]=useActionState(reviewAction,{status:'idle',message:''} as PortalResult);
 return <><form action={submit}><fieldset disabled={pending}><label>Shared note review from your assistant<textarea name="binding" required maxLength={10000}/></label><button>{pending?'Checking…':'Review shared note'}</button></fieldset></form>
 {state.message&&<p role={state.status==='error'?'alert':'status'}>{state.message}</p>}
 {state.groupReview&&<section aria-label="Exact shared note review"><h3>{state.groupReview.group}</h3><p>Visible to authorized group members and their consented assistants. This is a member-submitted note, not a group decision.</p><p>Assistant client: {state.groupReview.clientId}</p><p>Change: {state.groupReview.mutation} · Expected version {state.groupReview.expectedVersion}</p>{state.groupReview.currentText&&<><h4>Current note</h4><p>{state.groupReview.currentText}</p></>}{state.groupReview.text&&<><h4>Proposed note</h4><p>{state.groupReview.text}</p></>}
 <ActionForm key={state.groupReview.binding} action={approveAction} label="Approve this shared note change"><input type="hidden" name="binding" value={state.groupReview.binding}/><label className="lt-check"><input type="checkbox" name="reviewed" value="yes" required/>I reviewed the group, audience, assistant and exact change above.</label></ActionForm></section>}</>;
}
