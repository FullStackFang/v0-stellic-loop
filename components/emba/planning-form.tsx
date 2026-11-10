'use client';
import { useActionState } from 'react';
import type { PortalAction, PortalResult } from './portal-types';

export function PlanningForm({action,orgId,loopId}:{action:PortalAction;orgId:string;loopId:string}) {
  const [state,submit,pending]=useActionState(action,{status:'idle',message:''} as PortalResult);
  const result=state.planning;
  return <><form action={submit}><fieldset disabled={pending}><input type="hidden" name="orgId" value={orgId}/><input type="hidden" name="loopId" value={loopId}/><label>Place<input name="place" required maxLength={120}/></label><label>From (ISO date and time with UTC offset)<input name="start" required placeholder="2027-03-12T09:00:00+07:00"/></label><label>Until (ISO date and time with UTC offset)<input name="end" required placeholder="2027-03-12T18:00:00+07:00"/></label><label>Evidence search (optional)<input name="query" maxLength={500}/></label><button>{pending?'Finding evidence…':'Plan with my preferences'}</button></fieldset></form>
    {state.message && <p role={state.status==='error'?'alert':'status'}>{state.message}</p>}
    {result && <div>{result.insufficientEvidence && <p>No current evidence supports a plan. Ask your organizer for source material.</p>}{result.incompleteEvidence && <p>Evidence is incomplete; some sources may still need processing.</p>}{result.conflictingEvidence && <p>Sources conflict. Verify disputed details before relying on them.</p>}{result.truncated && <p>This planning bundle is truncated.</p>}<h3>Your relevant preferences</h3>{result.wants.length===0 && <p>No active relevant preferences.</p>}<ul>{result.wants.map(w=><li key={w.id}>{w.text} · Version {w.version}</li>)}</ul><h3>Cited evidence</h3>{result.passages.map((p,i)=><blockquote key={`${p.documentId}:${i}`}><p>{p.text}</p><p className="emba-meta">{p.title} · Version {p.version} · {p.location} · {p.timezone ?? 'Timezone not supplied'}{p.disputed?' · Disputed':''}</p></blockquote>)}<h3>Published activities</h3><ul>{result.activities.map(a=><li key={String(a.id)}>{String(a.title)} · Revision {String(a.revision)} · {String(a.starts_at)} (UTC) · {String(a.timezone)}</li>)}</ul></div>}
  </>;
}
