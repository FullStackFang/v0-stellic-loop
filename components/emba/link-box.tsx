'use client';

import { useActionState, useState } from 'react';
import type { PortalAction, PortalResult } from './portal-types';

const initial: PortalResult = { status: 'idle', message: '' };

/**
 * The one box above a team's events: paste a link and add it. When Loop cannot read the page the answer says so, and the same form
 * opens name, start, end and place fields and keeps the link, so the next press saves. Every field is held here, because a form
 * action clears the fields it does not control.
 */
export function LinkBox({ action, orgId, loopId, timezone }: { action: PortalAction; orgId: string; loopId: string; timezone: string }) {
  const [url, setUrl] = useState(''), [name, setName] = useState(''), [startsAt, setStartsAt] = useState(''), [endsAt, setEndsAt] = useState(''), [place, setPlace] = useState('');
  // Once the event is saved the box is empty again.
  const [state, submit, pending] = useActionState<PortalResult, FormData>(async (previous, data) => {
    const answer = await action(previous, data);
    if (answer.status === 'success') { setUrl(''); setName(''); setStartsAt(''); setEndsAt(''); setPlace(''); }
    return answer;
  }, initial);
  return <form action={submit} className="emba-form">
    <fieldset disabled={pending}>
      <input type="hidden" name="orgId" value={orgId} /><input type="hidden" name="loopId" value={loopId} />
      <label>Add an event from a link<input name="url" type="url" required maxLength={8000} placeholder="Paste a link to an event" value={url} onChange={event => setUrl(event.target.value)} /></label>
      {state.needsFacts && <>
        <label>Name<input name="name" required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Starts ({timezone})<input name="startsAt" type="datetime-local" required value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label>
        <label>Ends ({timezone}, optional)<input name="endsAt" type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} /></label>
        <label>Place (optional)<input name="place" maxLength={120} value={place} onChange={event => setPlace(event.target.value)} /></label></>}
      <button className="lt-primary" type="submit">{pending ? 'Saving…' : 'Add event'}</button>
    </fieldset>
    {state.message && <p role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
  </form>;
}
