'use client';

import { useActionState, useEffect, useState } from 'react';
import { hourText } from '@/lib/when/slots';
import { createPollAction } from '../actions';
import { Panel } from '../parts';

const KEPT = 'wn-new';
type Plan = { title: string; startDate: string; endDate: string; hourStart: string; hourEnd: string; expectedSize: string; by: string; threshold: string };
const HOURS = Array.from({ length: 25 }, (_, hour) => hour);

/**
 * The plan for a new poll. What is typed is kept in this tab, so signing in on the way does not lose it. The times are
 * on the clock of whoever makes the poll: their browser says which.
 */
export function CreateForm({ signIn, first }: { /** Where a signed-out person signs in; null when signed in. */ signIn: string | null; first: Plan }) {
  const [plan, setPlan] = useState(first), [state, submit, pending] = useActionState(createPollAction, null);
  // After the first paint, so the page the server drew and the one the browser draws start the same.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the tab's own storage
  useEffect(() => { try { const kept = sessionStorage.getItem(KEPT); if (kept) setPlan(now => ({ ...now, ...JSON.parse(kept) as Partial<Plan> })); } catch {} }, []);
  const set = (key: keyof Plan) => (event: { target: { value: string } }) => {
    const next = { ...plan, [key]: event.target.value };
    setPlan(next);
    try { sessionStorage.setItem(KEPT, JSON.stringify(next)); } catch {}
  };
  const send = (data: FormData) => {
    const by = new Date(plan.by);
    data.set('deadline', Number.isNaN(by.getTime()) ? '' : by.toISOString());
    data.set('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
    try { sessionStorage.removeItem(KEPT); } catch {}
    submit(data);
  };
  return <form action={send}>
    <Panel tab="Your plan"><div className="wn-fields">
      <label className="wn-f wide"><span>What are you planning</span><input name="title" required maxLength={80} placeholder="Problem set night" value={plan.title} onChange={set('title')} /></label>
      <label className="wn-f"><span>From</span><input name="startDate" type="date" required value={plan.startDate} onChange={set('startDate')} /></label>
      <label className="wn-f"><span>To</span><input name="endDate" type="date" required min={plan.startDate} value={plan.endDate} onChange={set('endDate')} /></label>
      <label className="wn-f"><span>From this hour</span><select name="hourStart" value={plan.hourStart} onChange={set('hourStart')}>{HOURS.slice(0, 24).map(hour => <option key={hour} value={hour}>{hourText(hour)}</option>)}</select></label>
      <label className="wn-f"><span>To this hour</span><select name="hourEnd" value={plan.hourEnd} onChange={set('hourEnd')}>{HOURS.slice(1).map(hour => <option key={hour} value={hour}>{hour === 24 ? 'Midnight' : hourText(hour)}</option>)}</select></label>
      <label className="wn-f wide"><span>How many people</span><input name="expectedSize" type="number" inputMode="numeric" required min={2} max={200} value={plan.expectedSize} onChange={set('expectedSize')} /></label>
      <label className="wn-f wide"><span>Answer by</span><input name="by" type="datetime-local" required value={plan.by} onChange={set('by')} /></label>
      <div className="wn-f wide" role="radiogroup" aria-label="It's on when this many can make it"><span>It&apos;s on when this many can make it</span><div className="wn-three">
        {[['majority', 'Majority'], ['two_thirds', 'Two thirds'], ['everyone', 'Everyone']].map(([value, label]) => <label key={value}><input type="radio" name="threshold" value={value} checked={plan.threshold === value} onChange={set('threshold')} />{label}</label>)}
      </div></div>
    </div></Panel>
    {state?.error && <p className="wn-note bad" role="alert">{state.error}</p>}
    {signIn ? <a className="cs-btn go wn-big" href={signIn}>Sign in to create the link</a> : <button className="cs-btn go wn-big" type="submit" disabled={pending}>{pending ? 'Creating' : 'Create the link'}</button>}
    <p className="wn-note">Anyone with the link can see it. Answering takes a quick sign-in.</p>
  </form>;
}
