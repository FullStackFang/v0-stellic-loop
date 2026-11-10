'use client';

import { useActionState } from 'react';
import type { PortalAction, PortalResult } from './portal-types';
import { ActionForm } from './portal-forms';

export function MemoryProposalReview({ reviewAction, acceptAction }: { reviewAction: PortalAction; acceptAction: PortalAction }) {
  const [state,submit,pending]=useActionState(reviewAction,{status:'idle',message:''} as PortalResult);
  const review=state.memoryReview;
  return <><form action={submit}><fieldset disabled={pending}><label>Structured want proposal (JSON)<textarea name="candidate" required maxLength={4096} /></label><p>Submit structured fields only. Do not paste a conversation. A proposal is temporary until you explicitly accept it.</p><button type="submit">{pending?'Reviewing…':'Review proposed want'}</button></fieldset></form>
    {state.message && <p role={state.status==='error'?'alert':'status'}>{state.message}</p>}
    {review && <div><h3>Proposal review</h3><p>Result: {review.outcome.replace('_',' ')}</p>
      <article><h4>Proposed want</h4><p>{review.candidate.text}</p><p>{review.candidate.category} · {review.candidate.place ?? 'No place'} · Strength {review.candidate.strength} · Extraction confidence {review.candidate.confidence}</p><p>{review.candidate.orgId ? 'Trip context' : 'Global personal context'} · {review.candidate.id ? `Based on version ${review.candidate.expectedVersion}` : 'New want'}</p></article>
      {review.current && <article><h4>Your current want</h4><p>{review.current.text}</p><p>{review.current.category} · {review.current.place ?? 'No place'} · Strength {review.current.strength} · Version {review.current.version} · {review.current.status}</p></article>}
      {(review.outcome==='new'||review.outcome==='conflict') && <ActionForm key={review.operationId} action={acceptAction} label="Accept this want"><input type="hidden" name="binding" value={review.binding}/><input type="hidden" name="operationId" value={review.operationId}/><label className="lt-check"><input name="reviewed" type="checkbox" value="yes" required/>I reviewed the proposed want and, if shown, my current version. Save this exact proposal.</label></ActionForm>}
    </div>}
  </>;
}
