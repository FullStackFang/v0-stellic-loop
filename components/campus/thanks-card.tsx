'use client';

import { useEffect, useState } from 'react';
import { SchoolAsk } from './no-school';
import '@/app/c/no-school.css';

/** The cookie "Got it" leaves, so the page is drawn without the card from then on. */
export const THANKED = 'loopd-thanked';
export type Standing = { school: string; place: number; left: number };

/**
 * On the Doodles page, for someone signed in with an email at no school (public/demo/mockups-any-email.html, B): the
 * thanks an Ink sign-up gets, in the same card, beside the page's name. They are signed up, and the games are theirs.
 * "Sign up my school" opens the school box in the card; the bar's "This week" card leads here with #school for that.
 * Once a school is signed up the card says where it stands in line. "Got it" puts the card away for good.
 */
export function ThanksCard({ asked, email, standing }: { asked: string | null; email: string | null; standing: Standing | null }) {
  const [school, setSchool] = useState(false), [gone, setGone] = useState(false);
  useEffect(() => {
    const look = () => { if (location.hash === '#school') setSchool(true); };
    look(); addEventListener('hashchange', look); return () => removeEventListener('hashchange', look);
  }, []);
  if (gone) return null;
  const away = () => { document.cookie = `${THANKED}=1; path=/; max-age=31536000; samesite=lax`; setGone(true); };
  return <div className="cs-ft-ask cs-ink-ask cs-dd-thanks" role="region" aria-label="Signed up">
    <span className="cs-ft-ask-tab">Signed up</span>
    <h3>Thanks for your interest.</h3>
    {school
      ? <div className="cs-ns cs-dd-school"><SchoolAsk asked={asked} email={email} /></div>
      : <p>{standing ? `${standing.school} is #${standing.place} in line. ${standing.left > 0 ? `${standing.left} more and Loopd opens there.` : 'Enough have signed up: Loopd opens there soon.'}` : 'Loopd is only at schools for now. We’ll let you know when it’s yours. Meanwhile the games are open.'}</p>}
    <div className="cs-ink-ask-acts">
      {school ? <button type="button" className="cs-btn sm" onClick={() => { setSchool(false); if (location.hash) history.replaceState(null, '', location.pathname + location.search); }}>Back</button>
        : <button type="button" className="cs-btn sm go" onClick={() => setSchool(true)}>{asked ? 'Change school' : 'Sign up my school'}</button>}
      <button type="button" className="cs-btn sm cs-ink-not" onClick={away}>Got it</button>
    </div>
  </div>;
}
