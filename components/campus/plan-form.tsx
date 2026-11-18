'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { changePlanAction, postPlanAction, type PlanState } from '@/app/c/actions';

export type PlanDraft = { id: string; title: string; starts: string; ends: string; place: string; about: string };

/** The post form: a title and a start, and optionally an end, a place and a line about it. Times are on the campus's clock. */
export function PlanForm({ campus, earliest, latest, plan }: { campus: { slug: string; name: string }; earliest: string; latest: string; plan?: PlanDraft }) {
  const [state, submit, pending] = useActionState<PlanState, FormData>(plan ? changePlanAction : postPlanAction, { message: '' });
  return <form action={submit} className="cs-form">
    <input type="hidden" name="campus" value={campus.slug} />{plan && <input type="hidden" name="listing" value={plan.id} />}
    <label>What is the plan?<input name="title" required maxLength={200} placeholder="Running, easy 5K" defaultValue={plan?.title} autoFocus /></label>
    <div className="two">
      <label>Starts<input name="starts" type="datetime-local" required min={earliest} max={latest} defaultValue={plan?.starts} /></label>
      <label>Ends <small>if you know</small><input name="ends" type="datetime-local" min={earliest} defaultValue={plan?.ends} /></label>
    </div>
    <label>Where <small>optional</small><input name="place" maxLength={300} placeholder="Arts Quad, at the statue" defaultValue={plan?.place} /></label>
    <label>One line about it <small>optional</small><textarea name="about" maxLength={1000} placeholder="Conversation pace, nobody gets dropped." defaultValue={plan?.about} /></label>
    {state.message && <p role="alert">{state.message}</p>}
    <div className="end">
      <span className="cs-note">{plan ? 'The people who are in stay in.' : `It shows at ${campus.name} at once, and you are counted in. Anyone signed in can join.`}</span>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {plan && <button className="cs-btn" name="intent" value="cancel" formNoValidate disabled={pending}>Cancel this plan</button>}
        <Link className="cs-btn" href={`/c/${campus.slug}`}>Back</Link>
        <button className="cs-btn go" disabled={pending}>{pending ? 'Saving…' : plan ? 'Save' : 'Post it'}</button>
      </span>
    </div>
  </form>;
}
