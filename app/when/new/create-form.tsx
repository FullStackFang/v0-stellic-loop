'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { addDays, dayNum, dow, mon, windowDays } from '@/lib/days';
import { DURATIONS, hourText, isWeekend, lengthText } from '@/lib/when/slots';
import { createPollAction, updatePollAction } from '../actions';
import { Panel } from '../parts';

const KEPT = 'wn-new', WEEKS = 5, STEP = 21;
type Plan = { title: string; startDate: string; endDate: string; hourStart: string; hourEnd: string; expectedSize: string; /** The last day to answer. */ by: string; threshold: string; /** '1' when Saturdays and Sundays are in the poll. */ weekends: string; /** How many minutes the meeting runs. */ duration: string };
const HOURS = Array.from({ length: 25 }, (_, hour) => hour);
const monday = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const short = (day: string) => `${dayNum(day)} ${mon(day)}`, full = (day: string) => `${dow(day)} ${short(day)}`;
const later = (a: string, b: string) => a > b ? a : b;
const LEFT = 'M10 3 5 8l5 5', RIGHT = 'M6 3l5 5-5 5';
const Arrow = ({ d }: { d: string }) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

/**
 * The plan for a new poll (public/demo/mockups-when-days.html). The days and the last day to answer are picked on one
 * calendar: a pill says which of the two a tap sets. What is typed is kept in this tab, so signing in on the way does not
 * lose it. The times are on the clock of whoever makes the poll: their browser says which.
 *
 * With `edit` it changes that poll in place of making one: the same fields, filled in, and nothing kept in the tab.
 *
 * On a laptop (.wn-make in when.css) it is one screen: the ticket across the top, the plan and the days side by side at
 * one height, and the action on a line across the foot.
 */
export function CreateForm({ signIn, first, today, head, edit }: { /** Where a signed-out person signs in; null when signed in. */ signIn: string | null; first: Plan; today: string; /** What leads the first column. */ head: ReactNode; /** The poll being changed. */ edit?: string }) {
  const [plan, setPlan] = useState(first), [state, submit, pending] = useActionState(edit ? updatePollAction : createPollAction, null);
  const [mode, setMode] = useState<'days' | 'by'>('days'), [half, setHalf] = useState(false), [from, setFrom] = useState(() => monday(today));
  // After the first paint, so the page the server drew and the one the browser draws start the same.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the tab's own storage
  useEffect(() => { if (edit) return; try { const kept = sessionStorage.getItem(KEPT); if (kept) setPlan(now => { const next = { ...now, ...JSON.parse(kept) as Partial<Plan> }; return { ...next, by: next.by.slice(0, 10) }; }); } catch {} }, [edit]);
  const change = (patch: Partial<Plan>) => {
    const next = { ...plan, ...patch };
    setPlan(next);
    if (!edit) try { sessionStorage.setItem(KEPT, JSON.stringify(next)); } catch {}
  };
  const set = (key: keyof Plan) => (event: { target: { value: string } }) => change({ [key]: event.target.value });
  const closed = (day: string) => day < today || (mode === 'by' ? day > later(today, addDays(plan.startDate, -1)) : plan.weekends === '0' && isWeekend(day));
  const tap = (day: string) => {
    if (closed(day)) return;
    if (mode === 'by') return change({ by: day });
    // The first tap starts the run of days; the second ends it, if it is later and within two weeks.
    const ends = half && day >= plan.startDate && windowDays(plan.startDate, day).length <= 14, startDate = ends ? plan.startDate : day;
    setHalf(!ends);
    change({ startDate, endDate: day, by: plan.by < startDate ? plan.by : later(today, addDays(startDate, -1)) });
  };
  const send = (data: FormData) => {
    // The poll closes when the last day to answer ends, on this browser's clock.
    const by = new Date(`${plan.by}T23:59:59`);
    data.set('deadline', Number.isNaN(by.getTime()) ? '' : by.toISOString());
    data.set('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (!edit) try { sessionStorage.removeItem(KEPT); } catch {}
    submit(data);
  };
  const days = windowDays(from, addDays(from, WEEKS * 7 - 1)), last = addDays(from, STEP - 1);
  const look = (day: string) => day === plan.by ? ' by' : day === plan.startDate || day === plan.endDate ? ' end' : day > plan.startDate && day < plan.endDate ? ' in' : '';
  return <form action={send}>
    <input type="hidden" name="startDate" value={plan.startDate} /><input type="hidden" name="endDate" value={plan.endDate} /><input type="hidden" name="weekends" value={plan.weekends} />{edit && <input type="hidden" name="pollId" value={edit} />}
    {head}<Panel tab="Your plan"><div className="wn-fields">
      <label className="wn-f wide"><span>What are you planning</span><input name="title" required maxLength={80} placeholder="Problem set night" value={plan.title} onChange={set('title')} /></label>
      <label className="wn-f"><span>From this hour</span><select name="hourStart" value={plan.hourStart} onChange={set('hourStart')}>{HOURS.slice(0, 24).map(hour => <option key={hour} value={hour}>{hourText(hour)}</option>)}</select></label>
      <label className="wn-f"><span>To this hour</span><select name="hourEnd" value={plan.hourEnd} onChange={set('hourEnd')}>{HOURS.slice(1).map(hour => <option key={hour} value={hour}>{hour === 24 ? 'Midnight' : hourText(hour)}</option>)}</select></label>
      <div className="wn-f wide" role="radiogroup" aria-label="Runs for"><span>Runs for</span><div className="wn-three" style={{ '--n': DURATIONS.length } as React.CSSProperties}>
        {DURATIONS.map(each => <label key={each}><input type="radio" name="duration" value={each} checked={plan.duration === String(each)} onChange={set('duration')} />{lengthText(each)}</label>)}
      </div></div>
      <label className="wn-f wide"><span>How many people</span><input name="expectedSize" type="number" inputMode="numeric" required min={2} max={200} value={plan.expectedSize} onChange={set('expectedSize')} /></label>
      <div className="wn-f wide" role="radiogroup" aria-label="It's on when this many can make it"><span>It&apos;s on when this many can make it</span><div className="wn-three">
        {[['majority', 'Majority'], ['two_thirds', 'Two thirds'], ['everyone', 'Everyone']].map(([value, label]) => <label key={value}><input type="radio" name="threshold" value={value} checked={plan.threshold === value} onChange={set('threshold')} />{label}</label>)}
      </div></div>
    </div></Panel>
    <Panel tab="The days"><div className="wn-fields">
      <div className="wn-f wn-half"><span role="status">{mode === 'by' ? 'Tap the last day to answer' : half ? 'Now tap the last day' : 'Tap the first day, then the last'}</span>
        <div className="wn-modes">
          <button type="button" aria-pressed={mode === 'days'} onClick={() => { setMode('days'); setHalf(false); }}><small>The days</small><b>{plan.startDate === plan.endDate ? full(plan.startDate) : `${mon(plan.startDate) === mon(plan.endDate) ? dayNum(plan.startDate) : short(plan.startDate)} to ${short(plan.endDate)}`}</b></button>
          <button type="button" aria-pressed={mode === 'by'} onClick={() => { setMode('by'); setHalf(false); }}><small>Answer by</small><b>{full(plan.by)}</b></button>
        </div></div>
        <div className="wn-cal">
          <div className="wn-cal-head"><span className="wn-cal-month">{mon(from) === mon(last) ? mon(from) : `${mon(from)} to ${mon(last)}`} {last.slice(0, 4)}</span>
            <button type="button" className="wn-cal-nav" aria-label="Earlier" disabled={from <= monday(today)} onClick={() => setFrom(later(monday(today), addDays(from, -STEP)))}><Arrow d={LEFT} /></button>
            <button type="button" className="wn-cal-nav" aria-label="Later" disabled={from > addDays(today, 60)} onClick={() => setFrom(addDays(from, STEP))}><Arrow d={RIGHT} /></button></div>
          <div className="wn-cal-wk" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(name => <span key={name}>{name}</span>)}</div>
          <div className="wn-cal-days">{days.map((day, at) => <button key={day} type="button" className={`wn-cal-d${look(day)}`} disabled={closed(day)} aria-label={full(day)} aria-pressed={look(day) !== ''} onClick={() => tap(day)}>
            {(at === 0 || dayNum(day) === 1) && <small>{mon(day)}</small>}{dayNum(day)}</button>)}</div>
        </div>
      <div className="wn-f wn-half" role="radiogroup" aria-label="Weekends"><span>Weekends</span><div className="wn-three" style={{ '--n': 2 } as React.CSSProperties}>
        {[['0', 'Leave them out'], ['1', 'Include them']].map(([value, label]) => <label key={value}><input type="radio" value={value} checked={plan.weekends === value} onChange={set('weekends')} />{label}</label>)}
      </div></div>
    </div></Panel>
    <div className="wn-foot">{state?.error && <p className="wn-note bad" role="alert">{state.error}</p>}
    {signIn ? <a className="cs-btn go wn-big" href={signIn}>Sign in to create the link</a> : <button className="cs-btn go wn-big" type="submit" disabled={pending}>{edit ? pending ? 'Saving' : 'Save the changes' : pending ? 'Creating' : 'Create the link'}</button>}
    <p className="wn-note">{edit ? 'The link stays the same. Times people painted outside the new days or hours are dropped.' : 'Anyone with the link can see it. Answering takes a quick sign-in.'}</p>
    {!signIn && <div className="wn-acts wn-mid">{edit && <a className="cs-btn sm" href={`/when/${edit}`}>Back to the poll</a>}<Link className="cs-btn sm" href="/when">Your polls</Link></div>}</div>
  </form>;
}
