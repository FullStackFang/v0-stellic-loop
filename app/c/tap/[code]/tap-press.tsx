'use client';

import { useState, useTransition } from 'react';
import { tapAction } from './actions';

/** What a press can come back with, in the person's words. */
export const TAP_SAYS: Record<string, string> = {
  unknown: 'This link does not lead anywhere. Ask your assistant again.',
  not_yours: 'This was made for someone else. Ask your own assistant.',
  used: 'This was already done.',
  expired: 'This ran out after ten minutes. Ask your assistant again.',
  sign_in: 'Sign in to continue.',
};

/** The one button that does the step, and "Not now", which leads back without doing anything. */
export function TapPress({ code, label, back, done }: { code: string; label: string; back: string; done: string }) {
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null), [busy, start] = useTransition();
  const press = () => start(async () => {
    const result = await tapAction(code);
    setSaid(result.done ? { ok: true, text: done } : { ok: false, text: result.reason === 'refused' ? result.message : TAP_SAYS[result.reason] });
  });
  if (said?.ok) return <>
    <p role="status">{said.text}</p>
    <div className="cs-ns-row"><a className="cs-btn go" href={back}>Back to this week</a></div>
  </>;
  return <>
    {said && <p role="alert">{said.text}</p>}
    <div className="cs-ns-row">
      <button type="button" className="cs-btn go" disabled={busy} onClick={press}>{label}</button>
      <a className="cs-btn" href={back}>Not now</a>
    </div>
  </>;
}
