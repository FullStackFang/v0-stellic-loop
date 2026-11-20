'use client';

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { askSchoolAction, findSchoolsAction } from '@/app/c/actions';
import type { FoundSchool, Standing } from '@/lib/campus/school-ask';
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
 * Where the school this person signed up stands (public/demo/mockups-school-waitlist.html, D): a ticket with a seat for
 * each person it takes to open there, filled with the animals of those who signed it up (the ringed one is theirs), its
 * place in line on the stub, and the schools just ahead and behind as slim tickets above and below. The place counts
 * up to itself once, as the page opens.
 */
export function SchoolStanding({ standing, seats }: { standing: Standing; seats: number }) {
  const { school, people, place, ahead, behind, faces, mine } = standing, [shown, setShown] = useState(place);
  useEffect(() => {
    if (typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let at = place + 8, timer = 0;
    const tick = () => { setShown(at); if (at-- > place) timer = window.setTimeout(tick, 70 + (place + 8 - at) * 16); };
    timer = window.setTimeout(tick, 350);
    return () => clearTimeout(timer);
  }, [place]);
  const left = Math.max(0, seats - people);
  return <div className="cs-ns-queue">
    {ahead && <div className="cs-ns-slim ahead"><span><span>{ahead.school}</span><em>{ahead.people - people + 1} more to pass</em></span><span>#{place - 1}</span></div>}
    <div className="cs-ns-seats">
      <div className="cs-ns-seats-main">
        <b>{school}</b>
        <small><b>{Math.min(people, seats)} of {seats}</b> seats · {left ? `${left} more and it opens` : 'enough to open'} · you’re the ringed one</small>
        <span className="cs-ns-grid" aria-hidden="true">{Array.from({ length: seats }, (_, at) => <span key={at} className={at === mine ? 'you' : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the animals are small files of their own */}
          {faces[at] && <img src={faces[at]} alt="" style={{ '--i': at } as CSSProperties} />}
        </span>)}</span>
      </div>
      <div className="cs-ns-seats-stub"><b><sup>#</sup>{shown}</b><small>in line</small></div>
    </div>
    {behind && <div className="cs-ns-slim behind"><span><span>{behind.school}</span><em>{behind.people} signed up</em></span><span>#{place + 1}</span></div>}
  </div>;
}

/** Two ways to move a school up the line: a link for the group chat, and an email to its student government, written for them. */
export function MoveUp({ school, people, site }: { school: string; people: number; site: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(`https://${site}`); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); } };
  const subject = `Bring Loopd to ${school}`;
  const body = `Hi,\n\nI'm a student at ${school}. Loopd is an app for going to campus events together: you see who's going, and groups unlock rewards for showing up. ${people === 1 ? 'I have' : `${people} of us have`} already signed up for it.\n\nWould you bring it to ${school}? https://${site}\n\nThanks!`;
  return <>
    <div className="cs-ns-step"><i>1</i><b>Bring your friends</b><p>Every person from {school} who signs up moves it up. Drop this in the group chat:</p>
      <div className="cs-ns-copy"><code>{site}</code><button type="button" className="cs-btn" onClick={copy}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /></svg>{copied ? 'Copied' : 'Copy'}</button></div></div>
    <div className="cs-ns-step"><i>2</i><b>Get student government on board</b><p>If they’re in, Loopd opens at {school} right away, whatever the count.</p>
      <a className="cs-btn go" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-9 5.7a2 2 0 0 1-2 0L2 7" /></svg>Send the email</a></div>
  </>;
}

/**
 * "Sign up my school", for a school Loopd is not at yet (public/demo/mockups-school-search.html). The box searches the
 * list of US colleges and shows what it finds as pills: one is picked, then signed up, so everyone who means a school
 * gives the same name. "Other" is offered only when the list has nothing like what was typed. Afterwards the school
 * is shown, kept.
 */
export function SchoolAsk({ asked, email, lined }: { asked: string | null; email: string | null; lined?: boolean }) {
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
  // Beside the school's place in line, which already names it, only the way to change it.
  if (kept && lined) return <div className="cs-ns-row"><button className="cs-btn" onClick={() => { setTyped(kept); setPick(null); setKept(null); }}>Change school</button></div>;
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
