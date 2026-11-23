'use client';

import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { DURATIONS, START_MINUTES, lengthText, spanText } from '@/lib/when/slots';
import { openedAction, sendPollAction } from '../actions';
import { Panel, Stack, Tile, type Shown } from '../parts';

export type Choice = { at: string; dow: string; date: string; time: string; /** The hour it starts in, on the poll's clock. */ hour: number; line: string; people: Shown[] };

/**
 * The organizer's part: the times that work best, one chosen; when in that hour it starts and how long it runs; a line
 * of their own; and send. Nothing leaves until they press.
 */
export function Pick({ pollId, choices, goesTo, as, minutes = 60 }: { pollId: string; choices: Choice[]; /** How long the poll said it runs. */ minutes?: number; /** How many people the invite goes to. */ goesTo: number; /** The name it is sent under. */ as: string }) {
  const [state, submit, pending] = useActionState(sendPollAction, null);
  const [slot, setSlot] = useState(choices[0]?.at), [minute, setMinute] = useState(0), [duration, setDuration] = useState(minutes), chosen = choices.find(choice => choice.at === slot) ?? choices[0];
  return <form action={submit}>
    <input type="hidden" name="pollId" value={pollId} />
    <Panel tab="The times that work best"><div className="wn-picks" role="radiogroup" aria-label="The times that work best">
      {choices.map(choice => <label key={choice.at}>
        <input type="radio" name="slot" value={choice.at} checked={choice.at === chosen.at} onChange={() => setSlot(choice.at)} />
        <Tile top={choice.dow} big={choice.date} /><span><b>{choice.time}</b><small>{choice.line}</small></span><Stack people={choice.people} />
      </label>)}
    </div></Panel>
    <Panel tab={<>The meeting <b>{chosen.dow} {chosen.date}, {spanText(chosen.hour * 60 + minute, duration)}</b></>}><div className="wn-fields">
      <div className="wn-f wide" role="radiogroup" aria-label="Starts at"><span>Starts at</span><div className="wn-three" style={{ '--n': START_MINUTES.length } as React.CSSProperties}>
        {START_MINUTES.map(each => <label key={each}><input type="radio" name="minute" value={each} checked={each === minute} onChange={() => setMinute(each)} />{chosen.hour % 12 || 12}:{String(each).padStart(2, '0')}</label>)}
      </div></div>
      <div className="wn-f wide" role="radiogroup" aria-label="Runs for"><span>Runs for</span><div className="wn-three" style={{ '--n': DURATIONS.length } as React.CSSProperties}>
        {DURATIONS.map(each => <label key={each}><input type="radio" name="duration" value={each} checked={each === duration} onChange={() => setDuration(each)} />{lengthText(each)}</label>)}
      </div></div>
      <label className="wn-f wide"><span>Add a line, if you like</span><input name="note" maxLength={200} placeholder="Olin Library, room 301." /></label>
    </div></Panel>
    {state?.error && <p className="wn-note bad" role="alert">{state.error}</p>}
    <button className="cs-btn go wn-big" type="submit" disabled={pending}>{pending ? 'Sending' : 'Send it to everyone'}</button>
    <p className="wn-note">Goes to the {goesTo} who answered, as &quot;{as} via Loopd&quot;, with a calendar invite.</p>
  </form>;
}

/** Notes, once the page is really on a screen, that this browser opened the poll. */
export function Opened({ pollId }: { pollId: string }) {
  useEffect(() => { void openedAction(pollId); }, [pollId]);
  return null;
}

/**
 * "Have Loopd? Sign in", without leaving the poll: the sign-in card opens over the page, and Close or Escape puts it
 * away. Nothing loads until it is pressed. The card is the caller's, so it comes already knowing where to land.
 */
export function SignInHere({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  return <>
    <button type="button" className="cs-btn sm" aria-expanded={open} onClick={() => setOpen(true)}>Have Loopd? Sign in</button>
    {open && <div className="wn-over" role="dialog" aria-modal="true" aria-label="Sign in" onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="wn-over-card"><button type="button" className="cs-btn sm wn-over-x" onClick={() => setOpen(false)}>Close</button>{children}</div>
    </div>}
  </>;
}

/** Copies the words to pass on. */
export function Copy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="cs-btn go" onClick={() => { navigator.clipboard.writeText(text).then(() => setCopied(true), () => setCopied(false)); }}>{copied ? 'Copied' : 'Copy the message'}</button>;
}
