'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SeatsWord } from '@/components/loading/seats';
import { hasInkPlusAction, subscribeAtFootAction } from './foot-actions';
import { InkMark } from './ink-mark';
import './foot.css';

/**
 * "Assistants" in the top bar, for someone in a group. Assistants is part of Ink+: for someone without it, pressing the
 * link opens a card under it that says so, in place of going there (the pill and the card are the ones picked in
 * public/demo/mockups-foot-legal.html, where the link first stood at the foot of the page).
 */
export function AssistantsLink() {
  const router = useRouter(), asked = useRef<Promise<boolean> | null>(null), [plus, setPlus] = useState(false), [ask, setAsk] = useState(false);
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [said, setSaid] = useState('');
  // Subscribe on the card: the press is kept (when, and where it was made), and then Assistants opens.
  const subscribe = async () => {
    setBusy(true); setSaid('');
    const got = await subscribeAtFootAction(email.trim()).catch(() => null);
    setBusy(false);
    if (!got) return setSaid(got === false ? 'Enter the email to subscribe with.' : 'That did not go through. Try again.');
    asked.current = Promise.resolve(true); setPlus(true); setAsk(false); router.push('/groups/connections');
  };
  // Asked once, when the link is first pointed at. If it cannot be asked, the link stays a link.
  const knows = () => asked.current ??= hasInkPlusAction().catch(() => true).then(has => { setPlus(has); return has; });
  const press = async (event: React.MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); if (ask) return setAsk(false); if (await knows()) router.push('/groups/connections'); else setAsk(true); };
  useEffect(() => { if (!ask) return; const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setAsk(false); }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [ask]);
  return <span className="cs-asst">
    <Link className="cs-ft-asst" href="/groups/connections" data-open={ask || undefined} onPointerEnter={knows} onFocus={knows} onClick={press}><InkMark />Assistants{!plus && <b>Ink+</b>}</Link>
    {ask && <div className="cs-ft-ask" role="dialog" aria-label="Assistants come with Ink+">
      <span className="cs-ft-ask-tab"><InkMark />Ink+</span><h3>Assistants come with Ink+</h3><p>Your own AI, answering from your groups.</p>
      <form onSubmit={event => { event.preventDefault(); void subscribe(); }}><input type="email" required value={email} onChange={event => setEmail(event.target.value)} aria-label="Email" placeholder="Email to subscribe with" autoComplete="email" />
        <button className="cs-btn sm go" disabled={busy}>{busy ? <SeatsWord word="Subscribing" plate /> : 'Subscribe · $9.99'}</button><button type="button" className="cs-btn sm" onClick={() => setAsk(false)}>Not now</button></form>
      {said && <p role="alert">{said}</p>}</div>}
  </span>;
}
