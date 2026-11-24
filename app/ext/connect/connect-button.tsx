'use client';

import { useEffect, useState, useTransition } from 'react';
import { connectExtAction, disconnectExtAction } from './actions';

// The page and the extension speak through window messages on this page only (design D4, task 1.2): the extension's
// small script on Loopd's own address answers "ext-here", takes "ext-token" to its service worker, and says "ext-saved".
// A message is taken only from this window and this origin.
type Said = { loopd: 'ext-ask' | 'ext-here' | 'ext-token' | 'ext-saved' | 'ext-forget'; token?: string };
const send = (said: Said) => window.postMessage(said, window.location.origin);

/** Connect, or Disconnect once connected. Connect waits until the extension says it is in this browser. */
export function ConnectButton({ connected: was }: { connected: boolean }) {
  const [here, setHere] = useState(false), [connected, setConnected] = useState(was), [said, setSaid] = useState(''), [busy, start] = useTransition();
  useEffect(() => {
    const hear = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as Partial<Said> | null;
      if (data?.loopd === 'ext-here') setHere(true);
      if (data?.loopd === 'ext-saved') { setConnected(true); setSaid('Connected. Open an event page on Luma, Posh, Eventbrite or CampusGroups.'); }
    };
    window.addEventListener('message', hear);
    send({ loopd: 'ext-ask' });
    return () => window.removeEventListener('message', hear);
  }, []);
  const connect = () => start(async () => {
    const got = await connectExtAction().catch(() => ({ message: 'That did not go through. Try again.' }));
    if ('message' in got) { setSaid(got.message); return; }
    send({ loopd: 'ext-token', token: got.token });
  });
  const disconnect = () => start(async () => {
    const got = await disconnectExtAction().catch(() => ({ ok: false }));
    if (!got.ok) { setSaid('That did not go through. Try again.'); return; }
    send({ loopd: 'ext-forget' }); setConnected(false); setSaid('Disconnected. The card shows no one until you connect again.');
  });
  return <>
    <p role="status">{said || (connected ? 'Your extension is connected.' : '')}</p>
    <div className="cs-ns-row">
      {connected
        ? <button type="button" className="cs-btn" disabled={busy} onClick={disconnect}>Disconnect</button>
        : <button type="button" className="cs-btn go" disabled={busy || !here} onClick={connect}>Connect</button>}
    </div>
    {!connected && !here && <p>Add the Loopd extension to Chrome first, then open this page again.</p>}
  </>;
}
