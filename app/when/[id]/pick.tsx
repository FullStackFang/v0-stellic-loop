'use client';

import { useActionState, useEffect, useState } from 'react';
import { openedAction, sendPollAction } from '../actions';
import { Panel, Stack, Tile, type Shown } from '../parts';

export type Choice = { at: string; dow: string; date: string; time: string; line: string; people: Shown[] };

/** The organizer's part: the times that work best, one chosen, a line of their own, and send. Nothing leaves until they press. */
export function Pick({ pollId, choices, goesTo, as }: { pollId: string; choices: Choice[]; /** How many people the invite goes to. */ goesTo: number; /** The name it is sent under. */ as: string }) {
  const [state, submit, pending] = useActionState(sendPollAction, null);
  return <form action={submit}>
    <input type="hidden" name="pollId" value={pollId} />
    <Panel tab="The times that work best"><div className="wn-picks" role="radiogroup" aria-label="The times that work best">
      {choices.map((choice, at) => <label key={choice.at}>
        <input type="radio" name="slot" value={choice.at} defaultChecked={at === 0} />
        <Tile top={choice.dow} big={choice.date} /><span><b>{choice.time}</b><small>{choice.line}</small></span><Stack people={choice.people} />
      </label>)}
    </div>
    <label className="wn-f"><span>Add a line, if you like</span><input name="note" maxLength={200} placeholder="Olin Library, room 301." /></label></Panel>
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

/** Copies the words to pass on. */
export function Copy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="cs-btn" onClick={() => { navigator.clipboard.writeText(text).then(() => setCopied(true), () => setCopied(false)); }}>{copied ? 'Copied' : 'Copy the message'}</button>;
}
