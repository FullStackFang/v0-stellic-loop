'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DOODLES_PAGE } from '@/lib/campus/doodles';
import './foot.css';

/** Where "Sign up my school" leads: the Doodles page, with the thanks card open on the school box (components/campus/thanks-card.tsx). */
export const SIGN_UP_SCHOOL = `${DOODLES_PAGE}#school`;

/**
 * "This week" in the top bar, for someone signed in with an email at no school (public/demo/mockups-any-email.html, 3).
 * A campus is for the people at its school, so it is shown with a lock, never hidden, and pressing it opens a card under
 * it that says why and offers "Sign up my school", in place of going there. The card is the one ask card's look
 * (InkAsk), under the link as Assistants' is. Escape or Not now closes it.
 */
export function SchoolsOnlyLink({ href, current }: { href: string; current?: 'page' }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [open]);
  return <span className="cs-asst">
    <Link className="cs-ft-asst" href={href} aria-current={current} data-open={open || undefined} aria-expanded={open} aria-label="This week, for schools only" onClick={event => { event.preventDefault(); setOpen(now => !now); }}>
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>This week
    </Link>
    {open && <div className="cs-ft-ask cs-ink-ask" role="dialog" aria-label="The campus opens with a school email">
      <span className="cs-ft-ask-tab">Schools only</span>
      <h3>The campus opens with a school email</h3>
      <p>Each campus is for the people at that school. Tell us yours and it moves up the line.</p>
      <div className="cs-ink-ask-acts"><Link className="cs-btn sm go" href={SIGN_UP_SCHOOL} onClick={() => setOpen(false)}>Sign up my school</Link><button type="button" className="cs-btn sm cs-ink-not" onClick={() => setOpen(false)}>Not now</button></div>
    </div>}
  </span>;
}
