'use client';

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { askSchoolAction, findSchoolsAction } from '@/app/c/actions';
import type { FoundSchool } from '@/lib/campus/school-ask';
import { SeatsWord } from '@/components/loading/seats';

/** A headline of whole lines, sized so the longest one runs from edge to edge of the room it has. */
export function FitLines({ lines }: { lines: ReactNode[] }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const big = ref.current;
    if (!big) return;
    const fit = () => {
      big.style.fontSize = '100px';
      const wide = Math.max(...[...big.children].map(each => { const line = each as HTMLElement; line.style.display = 'inline-block'; const width = line.getBoundingClientRect().width; line.style.display = ''; return width; }));
      big.style.fontSize = wide > 0 ? `${100 * big.clientWidth / wide * .995}px` : '';
    };
    fit(); document.fonts?.ready.then(fit);
    const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    watch?.observe(big);
    return () => watch?.disconnect();
  }, []);
  // The space between the lines is for anything that reads the heading as one sentence.
  return <h1 ref={ref}>{lines.map((line, at) => [at > 0 && ' ', <span key={at}>{line}</span>])}</h1>;
}

/**
 * "Continue with LinkedIn", for someone who signed in another way: LinkedIn is connected to the account they have, so
 * nobody signs in twice. They go to LinkedIn and come back to this page, which then knows the LinkedIn account is
 * theirs. `other` sits beside the button. Where the sign-in service says LinkedIn is switched off there is no button,
 * and `fallback` is shown in its place. Rendered only where sign-in is set up.
 */
export function ConnectLinkedin({ other, fallback }: { other?: ReactNode; fallback?: ReactNode }) {
  const clerk = useClerk(), { user } = useUser(), [message, setMessage] = useState(''), [busy, start] = useTransition();
  const off = (clerk as unknown as { __unstable__environment?: { userSettings?: { social?: Record<string, { enabled?: boolean } | undefined> } } }).__unstable__environment?.userSettings?.social?.oauth_linkedin_oidc?.enabled === false;
  if (off) return <>{fallback}<div className="cs-ns-row">{other}</div></>;
  const connect = () => start(async () => {
    try {
      if (!user) throw new Error('not signed in');
      const account = await user.createExternalAccount({ strategy: 'oauth_linkedin_oidc', redirectUrl: window.location.href }), to = account.verification?.externalVerificationRedirectURL;
      if (!to) throw new Error('no way to LinkedIn');
      window.location.assign(to.href);
    } catch { setMessage('LinkedIn did not connect. Try again in a moment.'); }
  });
  return <><div className="cs-ns-row"><button type="button" className="cs-btn go" disabled={busy || !user} onClick={connect}><SeatsWord on={busy} word="Continue with LinkedIn" plate>Continue with LinkedIn</SeatsWord></button>{other}</div>{message && <p role="alert">{message}</p>}</>;
}

/**
 * "Sign up my school", for a school Loopd is not at yet (public/demo/mockups-school-search.html). The box searches the
 * list of US colleges and shows what it finds as pills: one is picked, then signed up, so everyone who means a school
 * gives the same name. "Other" is offered only when the list has nothing like what was typed. Afterwards the school
 * is shown, kept.
 */
export function SchoolAsk({ asked, email }: { asked: string | null; email: string | null }) {
  const [kept, setKept] = useState(asked), [typed, setTyped] = useState(''), [pick, setPick] = useState<string | null>(null);
  const [seen, setSeen] = useState<{ of: string; found: FoundSchool[]; total: number } | null>(null), [message, setMessage] = useState(''), [busy, start] = useTransition();
  const clean = typed.trim().replace(/\s+/g, ' '), long = clean.length >= 2;
  useEffect(() => {
    if (!long) return;
    let live = true;
    const wait = setTimeout(async () => { const got = await findSchoolsAction(clean); if (live) setSeen({ of: clean, ...got }); }, 160);
    return () => { live = false; clearTimeout(wait); };
  }, [clean, long]);
  // What was found for an earlier letter stays up until the answer for this one is in; "Other" waits for that answer.
  const found = long && seen ? seen.found : [], sure = long && seen?.of === clean ? seen : null, other = sure && !sure.total ? clean : null;
  const here = found.find(each => each.label === pick)?.here ?? null;
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!pick || here) return;
    start(async () => {
      const done = await askSchoolAction(pick);
      if (done.ok) { setKept(pick); setMessage(''); } else setMessage(done.message);
    });
  };
  if (kept) return <>
    <div className="cs-ns-kept"><small>We will email you when Loopd opens at</small><b>{kept}</b><span className="cs-ns-stamp">On the list</span></div>
    <div className="cs-ns-row"><button className="cs-btn" onClick={() => { setTyped(kept); setPick(null); setKept(null); }}>Change school</button></div>
  </>;
  const pill = (label: string, inside: ReactNode, tone?: string) => <button key={label} type="button" className={tone} aria-pressed={pick === label} onClick={() => { setPick(pick === label ? null : label); setMessage(''); }}>{inside}</button>;
  return <>
    <form className="cs-ns-row" onSubmit={add}>
      <input className="cs-ns-box" aria-label="Your school" placeholder="School not listed? Search for it" autoComplete="off" maxLength={120} value={typed} onChange={event => { setTyped(event.target.value); setPick(null); setMessage(''); }} />
      <button className="cs-btn" disabled={busy || !pick || !!here}><SeatsWord on={busy} word="Sign up my school">Sign up my school</SeatsWord></button>
    </form>
    {(found.length > 0 || other) && <div className="cs-ns-sug" role="group" aria-label="Schools found">
      {found.map(each => pill(each.label, <>{each.label}<small>{each.here ? 'Loopd is here' : each.where}</small></>))}
      {other && pill(other, <>Other: “{other}”</>, 'other')}
    </div>}
    <p role="status">{message
      || (here ? `Loopd is already at ${here}. Use the way in above.`
        : pick ? `We will email ${email ?? 'you'} when Loopd opens at ${pick}.`
        : other ? 'No US college by that name on our list. Check the spelling, or add it as Other.'
        : sure && sure.total > found.length ? `${sure.total} schools match. Keep typing to narrow it down.`
        : found.length ? 'Pick your school.'
        : `We will email ${email ?? 'you'} when Loopd opens there.`)}</p>
  </>;
}
