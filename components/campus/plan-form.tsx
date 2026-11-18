'use client';

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { changePlanAction, postPlanAction, readPlanLinkAction, type PlanState } from '@/app/c/actions';

export type PlanDraft = { id: string; title: string; starts: string; ends: string; place: string; about: string };
type Fields = Omit<PlanDraft, 'id'>;

/**
 * The post form: a title and a start, and optionally an end, a place and a line about it. Times are on the campus's
 * clock. A new plan can start from an event page's link: Loop reads the page into the form, and the person checks it
 * and posts it.
 */
export function PlanForm({ campus, earliest, latest, plan }: { campus: { slug: string; name: string }; earliest: string; latest: string; plan?: PlanDraft }) {
  const [state, submit, pending] = useActionState<PlanState, FormData>(plan ? changePlanAction : postPlanAction, { message: '' });
  const [fields, setFields] = useState<Fields>({ title: plan?.title ?? '', starts: plan?.starts ?? '', ends: plan?.ends ?? '', place: plan?.place ?? '', about: plan?.about ?? '' });
  const [typed, setTyped] = useState(''), [link, setLink] = useState(''), [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [reading, startReading] = useTransition();
  const field = (key: keyof Fields) => ({ name: key, value: fields[key], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields(now => ({ ...now, [key]: event.target.value })) });
  const fill = () => startReading(async () => {
    const got = await readPlanLinkAction(campus.slug, typed).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
    if (!got.ok) { setSaid({ text: got.message, bad: true }); return; }
    setLink(got.link); setTyped(''); setSaid({ text: got.note, bad: false });
    // What the person already typed stays when the page could not be read.
    if (got.filled) setFields(got.filled);
  });
  return <form action={submit} className="cs-form">
    <input type="hidden" name="campus" value={campus.slug} />{plan && <input type="hidden" name="listing" value={plan.id} />}
    {!plan && <div className="from">
      <label htmlFor="plan-link">Found it somewhere? <small>Paste its link and Loop fills this in from a Luma, Posh or Eventbrite page.</small></label>
      <div className="row">
        <input id="plan-link" inputMode="url" autoComplete="off" maxLength={2000} placeholder="https://lu.ma/…" value={typed} onChange={event => setTyped(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (typed.trim() && !reading) fill(); } }} />
        <button type="button" className="cs-btn" disabled={reading || !typed.trim()} onClick={fill}>{reading ? 'Reading…' : 'Fill in'}</button>
      </div>
      {said && <p role={said.bad ? 'alert' : 'status'} className={said.bad ? undefined : 'cs-note'}>{said.text}</p>}
      {link && <p className="kept"><input type="hidden" name="link" value={link} /><span>{link.replace(/^https:\/\//, '')}</span>
        <button type="button" onClick={() => { setLink(''); setSaid(null); }}>Remove link</button></p>}
    </div>}
    <label>What is the plan?<input {...field('title')} required maxLength={200} placeholder="Running, easy 5K" autoFocus /></label>
    <div className="two">
      <label>Starts<input {...field('starts')} type="datetime-local" required min={earliest} max={latest} /></label>
      <label>Ends <small>if you know</small><input {...field('ends')} type="datetime-local" min={earliest} /></label>
    </div>
    <label>Where <small>optional</small><input {...field('place')} maxLength={300} placeholder="Arts Quad, at the statue" /></label>
    <label>One line about it <small>optional</small><textarea {...field('about')} maxLength={1000} placeholder="Conversation pace, nobody gets dropped." /></label>
    {state.message && <p role="alert">{state.message}</p>}
    <div className="end">
      <span className="cs-note">{plan ? 'The people who are in stay in.' : `It shows at ${campus.name} at once, and you are counted in. Anyone signed in can join.`}</span>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {plan && <button className="cs-btn" name="intent" value="cancel" formNoValidate disabled={pending}>Cancel this plan</button>}
        <Link className="cs-btn" href={`/c/${campus.slug}`}>Back</Link>
        <button className="cs-btn go" disabled={pending || reading}>{pending ? 'Saving…' : plan ? 'Save' : 'Post it'}</button>
      </span>
    </div>
  </form>;
}
