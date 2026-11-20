'use client';

import { useLayoutEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { askSchoolAction } from '@/app/c/actions';
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
  return <><div className="cs-ns-row"><button type="button" className="cs-btn go" disabled={busy || !user} onClick={connect}>{busy ? <SeatsWord word="Continue with LinkedIn" plate /> : 'Continue with LinkedIn'}</button>{other}</div>{message && <p role="alert">{message}</p>}</>;
}

/** "My school is not here yet": a pill that opens the box for naming it. Open from the start once a school is named. */
export function NotHere({ asked, email }: { asked: string | null; email: string | null }) {
  const [open, setOpen] = useState(asked !== null);
  return <>
    <div className="cs-ns-row"><button type="button" className="cs-kit" aria-pressed={open} onClick={() => setOpen(!open)}><i />My school is not here yet</button></div>
    {open && <SchoolAsk asked={asked} email={email} />}
  </>;
}

/** "Which school are you at?": one box and one button, and afterwards the school they named, kept. */
export function SchoolAsk({ asked, email }: { asked: string | null; email: string | null }) {
  const [kept, setKept] = useState(asked), [typed, setTyped] = useState(''), [message, setMessage] = useState(''), [busy, start] = useTransition();
  const add = (event: FormEvent) => {
    event.preventDefault();
    const school = typed.trim().replace(/\s+/g, ' ');
    start(async () => {
      const done = await askSchoolAction(school);
      if (done.ok) { setKept(school); setMessage(''); } else setMessage(done.message);
    });
  };
  if (kept) return <>
    <div className="cs-ns-kept"><small>We will email you when Loopd opens at</small><b>{kept}</b><span className="cs-ns-stamp">On the list</span></div>
    <div className="cs-ns-row"><button className="cs-btn" onClick={() => { setTyped(kept); setKept(null); }}>Change school</button></div>
  </>;
  return <>
    <form className="cs-ns-row" onSubmit={add}>
      <input className="cs-ns-box" aria-label="Your school" placeholder="Your school" autoComplete="off" maxLength={120} required value={typed} onChange={event => setTyped(event.target.value)} />
      <button className="cs-btn go" disabled={busy}>{busy ? <SeatsWord word="Add my school" plate /> : 'Add my school'}</button>
    </form>
    <p role="status">{message || `We will email ${email ?? 'you'} when Loopd opens there.`}</p>
  </>;
}
