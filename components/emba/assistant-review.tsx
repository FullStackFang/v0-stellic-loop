'use client';
import { useActionState } from 'react';
import type { PortalAction, PortalResult } from './portal-types';
import { ActionForm } from './portal-forms';

export function AssistantReview({reviewAction,approveAction}:{reviewAction:PortalAction;approveAction:PortalAction}) {
  const [state,submit,pending]=useActionState(reviewAction,{status:'idle',message:''} as PortalResult);
  return <><form action={submit}><fieldset disabled={pending}><label>Structured action from your assistant<textarea name="binding" required maxLength={32768} /></label><button type="submit">{pending?'Loading review…':'Review action'}</button></fieldset></form>
    {state.message && <p role={state.status==='error'?'alert':'status'}>{state.message}</p>}
    {state.review && <div><h3>{state.review.title}</h3><p>{state.review.place} · {state.review.startsAt} to {state.review.endsAt} (offsets shown) · Trip timezone: {state.review.timezone}</p><p>Assistant: {state.review.clientId} · Action: {state.review.action} · Revision: {state.review.revision}</p><p>{state.review.conditions}</p><p>{state.review.disclosure}</p><details><summary>Exact structured payload</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{state.review.binding}</pre></details><ActionForm key={state.review.binding} action={approveAction} label="Approve this exact assistant action"><input type="hidden" name="binding" value={state.review.binding} /><label className="lt-check"><input name="reviewed" type="checkbox" value="yes" required />I reviewed the activity, conditions and disclosure above.</label></ActionForm></div>}
  </>;
}
