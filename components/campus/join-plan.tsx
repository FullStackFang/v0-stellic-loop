'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { SeatsWord } from '@/components/loading/seats';
import type { JoinPlace } from '@/lib/campus/ink';
import { DoorSignIn, type School } from './door-sign-in';
import { InkMark } from './ink-mark';

type Plan = 'ink' | 'plus';
/** What each plan is called and costs, on every Get button (public/demo/mockups-ink-buttons.html). */
export const PLAN = { ink: { name: 'Ink', price: '$2.99' }, plus: { name: 'Ink+', price: '$9.99' } } as const;

/**
 * A sign-up pressed while signed out, kept in the browser while the person signs in. The top bar (HeldInk) gives them the
 * plan once they are back, signed in, on whatever page sign-in landed on. Kept an hour; one at a time.
 */
export const HELD = 'loopd-held-ink';
const HOUR = 3600_000;
export function hold(plan: Plan, place: JoinPlace) { try { localStorage.setItem(HELD, JSON.stringify({ plan, place, at: Date.now() })); } catch {} }
function held(): { plan: Plan; place: JoinPlace } | null {
  try {
    const got = JSON.parse(localStorage.getItem(HELD) ?? 'null') as { plan?: unknown; place?: unknown; at?: unknown } | null;
    if (!got || typeof got.at !== 'number' || Date.now() - got.at > HOUR || (got.plan !== 'ink' && got.plan !== 'plus') || typeof got.place !== 'string') { localStorage.removeItem(HELD); return null; }
    return { plan: got.plan, place: got.place as JoinPlace };
  } catch { return null; }
}

type Joined = { said: string } | { message: string } | { door: { schools: School[]; configured: boolean } };
/**
 * Signs the person up for Ink or Ink+ from where they are (openspec loop-ink-tiers, "Every ask signs you up"): one
 * press, the account's email, and the place recorded (app/c/ink/join). Someone signed out gets what the sign-in card
 * needs, to sign in right there.
 */
export async function joinPlan(plan: Plan, place: JoinPlace, again = false): Promise<Joined> {
  const answer = await fetch('/c/ink/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan, place, back: location.pathname + location.search, ...again ? { again } : {} }) }).catch(() => null);
  const got = await answer?.json().catch(() => null) as { ok?: boolean; said?: string; signIn?: string; message?: string; schools?: School[]; configured?: boolean } | null;
  if (got?.signIn) return { door: { schools: got.schools ?? [], configured: !!got.configured } };
  return got?.ok && got.said ? { said: got.said } : { message: got?.message ?? 'That did not go through. Try again.' };
}

/** The face of every Get button: the plan's mark, "Get Ink" or "Get Ink+", and the price. */
export const GetFace = ({ plan }: { plan: Plan }) => <><InkMark plus={plan === 'plus'} />Get {PLAN[plan].name}{' '}<span className="cs-get-price">· {PLAN[plan].price}</span></>;

/**
 * The one button that signs up for a plan, in every place (public/demo/mockups-ink-buttons.html). Signed in, one press
 * does it, and the thanks every sign-up says takes the button's place, with `then` (else "Done", which shows the page
 * again with the plan). `onJoined` is for a place that goes on by itself instead. Signed out, the sign-in card opens
 * right where the button was, and the plan is held until they are back.
 */
export function GetInk({ plan, place, small = false, then = 'Done', onDone, onJoined }: { plan: Plan; place: JoinPlace; small?: boolean; then?: ReactNode; onDone?: () => void; onJoined?: (said: string) => void }) {
  const [busy, setBusy] = useState(false), [said, setSaid] = useState(''), [wrong, setWrong] = useState(''), [door, setDoor] = useState<{ schools: School[]; configured: boolean } | null>(null);
  if (said) return <span className="cs-joined" role="status"><InkMark plus={plan === 'plus'} /><span>{said}</span>{onDone ? <button type="button" className="cs-btn sm" onClick={onDone}>{then}</button> : <Again>{then}</Again>}</span>;
  if (door) return <div className="cs-get-in">
    <span className="cs-get-held"><InkMark plus={plan === 'plus'} />{PLAN[plan].name} · {PLAN[plan].price}<small>held for you</small></span>
    <DoorSignIn schools={door.schools} routing="hash" configured={door.configured} back={location.pathname + location.search} />
    <button type="button" className="cs-get-back" onClick={() => setDoor(null)}>Back</button>
  </div>;
  return <>
    <button type="button" className={`cs-get${small ? ' sm' : ''}`} disabled={busy} onClick={async () => {
      setBusy(true); setWrong('');
      const got = await joinPlan(plan, place);
      setBusy(false);
      if ('door' in got) { hold(plan, place); setDoor(got.door); }
      else if ('said' in got) { if (onJoined) onJoined(got.said); else setSaid(got.said); }
      else setWrong(got.message);
    }}><SeatsWord on={busy} word="Signing up" plate><GetFace plan={plan} /></SeatsWord></button>
    {wrong && <p role="alert">{wrong}</p>}
  </>;
}

/** After signing up: shows the page again, with the plan. Apart, so a Get button asks for the router only then. */
function Again({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <button type="button" className="cs-btn sm" onClick={() => router.refresh()}>{children}</button>;
}

/**
 * The one ask card (public/demo/mockups-ink-buttons.html, the footer's dark card first): the plan's tab, one bold line,
 * one line of what that plan gives, then Get and Not now. It names its own plan, and says only what that plan gives.
 * Where it stands is the place's (`className`). Escape or Not now closes it.
 */
export function InkAsk({ plan, place, title, label, line, then, onDone, onClose, className = '', children }: { plan: Plan; place: JoinPlace; title: ReactNode; /** What a screen reader calls the card, where the title is more than words. */ label?: string; line: ReactNode; then?: ReactNode; onDone?: () => void; onClose: () => void; className?: string; children?: ReactNode }) {
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [onClose]);
  // Once signed up, or while signing in, Not now steps aside (app/c/campus.css).
  return <div className={`cs-ft-ask cs-ink-ask ${className}`} role="dialog" aria-label={label ?? (typeof title === 'string' ? title : PLAN[plan].name)}>
    <span className="cs-ft-ask-tab"><InkMark plus={plan === 'plus'} />{PLAN[plan].name}</span>
    <h3>{title}</h3>{children}<p>{line}</p>
    <div className="cs-ink-ask-acts"><GetInk plan={plan} place={place} small then={then} onDone={onDone} /><button type="button" className="cs-btn sm cs-ink-not" onClick={onClose}>Not now</button></div>
  </div>;
}

/**
 * In the top bar on every page: a sign-up that was pressed signed out, given once the person is back signed in. Still
 * signed out, it waits. The thanks shows in the card every sign-up uses.
 */
export function HeldInk() {
  const [said, setSaid] = useState<{ plan: Plan; said: string } | null>(null);
  useEffect(() => {
    const was = held(); if (!was) return;
    // Asking again for a held plan is not a press: the route keeps no signed-out press for it.
    void joinPlan(was.plan, was.place, true).then(got => { if ('door' in got) return; localStorage.removeItem(HELD); if ('said' in got) setSaid({ plan: was.plan, said: got.said }); });
  }, []);
  return said && <Held plan={said.plan} said={said.said} onDone={() => setSaid(null)} />;
}
/** The card HeldInk shows. Apart, so the bar asks for the router only once there is something to show. */
function Held({ plan, said, onDone }: { plan: Plan; said: string; onDone: () => void }) {
  const router = useRouter();
  return <div className="cs-ft-ask cs-ink-ask cs-held" role="status">
    <span className="cs-ft-ask-tab"><InkMark plus={plan === 'plus'} />{PLAN[plan].name}</span>
    <h3>You have {PLAN[plan].name}</h3><p>{said}</p>
    <div className="cs-ink-ask-acts"><button type="button" className="cs-btn sm" onClick={() => { onDone(); router.refresh(); }}>Done</button></div>
  </div>;
}
