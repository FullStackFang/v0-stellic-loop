'use client';

import { useState, useTransition } from 'react';
import { recordAction } from './actions';

/**
 * A place's record link on the Places tab (openspec campus-venue-record): "Copy record link", "New link" and the Public
 * switch. Each stays on the page and says what happened; a link is put on the clipboard, or shown when it cannot be.
 */
export function RecordControls({ campus, place, name, open }: { campus: string; place: string; name: string; /** Whether the record is public. */ open: boolean }) {
  const [said, setSaid] = useState<string | null>(null), [busy, start] = useTransition();
  const press = (step: string) => start(async () => {
    const data = new FormData();
    data.set('campus', campus); data.set('tab', 'places'); data.set('place', place); data.set('step', step);
    const { said, path } = await recordAction(data);
    if (!path) return setSaid(said);
    const link = `${location.origin}${path}`;
    try { await navigator.clipboard.writeText(link); setSaid(`${said} Copied.`); } catch { setSaid(`${said} ${link}`); }
  });
  return <div className="cs-adm-record" aria-busy={busy}>
    <button type="button" className="cs-btn sm" disabled={busy} onClick={() => press('copy')}>Copy record link</button>
    <button type="button" className="cs-btn sm" disabled={busy} onClick={() => press('renew')}>New link</button>
    <span className="cs-adm-record-sw">Public<button type="button" className={`cs-adm-sw ${open ? 'on' : ''}`} aria-pressed={open} aria-label={`${name}'s record is public`} disabled={busy} onClick={() => press(open ? 'private' : 'public')} /></span>
    {said && <p className="cs-adm-said" role="status">{said}</p>}
  </div>;
}
