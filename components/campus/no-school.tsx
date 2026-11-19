'use client';

import { useLayoutEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { askSchoolAction } from '@/app/c/actions';

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
    <div className="cs-ns-kept"><small>We will email you when Loop opens at</small><b>{kept}</b><span className="cs-ns-stamp">On the list</span></div>
    <div className="cs-ns-row"><button className="cs-btn" onClick={() => { setTyped(kept); setKept(null); }}>Change school</button></div>
  </>;
  return <>
    <form className="cs-ns-row" onSubmit={add}>
      <input className="cs-ns-box" aria-label="Your school" placeholder="Your school" autoComplete="off" maxLength={120} required value={typed} onChange={event => setTyped(event.target.value)} />
      <button className="cs-btn go" disabled={busy}>Add my school</button>
    </form>
    <p role="status">{message || `We will email ${email ?? 'you'} when Loop opens there.`}</p>
  </>;
}
