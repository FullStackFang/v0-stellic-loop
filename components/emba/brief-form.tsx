'use client';

import { useActionState, useState } from 'react';
import type { PortalAction, PortalResult } from './portal-types';

const initial: PortalResult = { status: 'idle', message: '' };

/** The brief editor. Its fields are held in state, so a refused save leaves what was typed in place; a plain form would reset it. */
export function BriefForm({ action, orgId, loopId, version, body, deadline, timezone }: { action: PortalAction; orgId: string; loopId: string; version: number; body: string; deadline: string; timezone: string }) {
  const [state, submit, pending] = useActionState(action, initial);
  const [text, setText] = useState(body), [due, setDue] = useState(deadline), [zone, setZone] = useState(timezone);
  return <form action={submit} className="emba-form">
    <fieldset disabled={pending}>
      <input type="hidden" name="orgId" value={orgId} /><input type="hidden" name="loopId" value={loopId} /><input type="hidden" name="expectedVersion" value={version} />
      <label>Brief (at most 4,000 characters)<textarea name="body" maxLength={4000} rows={8} value={text} onChange={event => setText(event.target.value)} /></label>
      <label>Deadline (optional)<input name="deadline" type="date" value={due} onChange={event => setDue(event.target.value)} /></label>
      <label>Team timezone<input name="timezone" value={zone} onChange={event => setZone(event.target.value)} maxLength={64} placeholder="America/New_York" /></label>
      <p>Every member&apos;s assistant receives the brief as written. Earlier versions are kept below. Saving an empty brief clears it.</p>
      <button className="lt-primary" type="submit">{pending ? 'Saving…' : 'Save brief'}</button>
    </fieldset>
    {state.message && <p role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
  </form>;
}
