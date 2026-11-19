'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { setSchoolsAction } from '@/app/c/actions';
import type { Schools } from '@/lib/campus/view';

/**
 * "Add a school": the address of the person's LinkedIn profile, the schools Loop is at to tick, and one button. The
 * school a person is at stays ticked. Nothing is read from LinkedIn (lib/campus/linkedin.ts). `box` is the class of
 * the text box where the page has its own. Afterwards `onDone` runs, or else the page is loaded again. `waiting` is
 * for someone with no school email whose profile the admin has not approved yet: they are shown what they sent, and
 * may change it.
 */
export function AddSchools({ schools, box, waiting = false, onDone }: { schools: Schools; box?: string; waiting?: boolean; onDone?: () => void }) {
  const [changing, setChanging] = useState(false);
  const [typed, setTyped] = useState(schools.profile?.replace('https://www.', '') ?? ''), [ticked, setTicked] = useState(schools.added), [message, setMessage] = useState(''), [busy, start] = useTransition();
  const save = (event: FormEvent) => {
    event.preventDefault();
    start(async () => {
      const done = await setSchoolsAction(typed, ticked);
      if (!done.ok) return setMessage(done.message);
      setMessage('');
      if (onDone) onDone(); else window.location.reload();
    });
  };
  if (waiting && !changing) return <>
    <div className="cs-ns-kept"><small>We are checking your LinkedIn profile for</small><b>{schools.added.flatMap(slug => schools.all.find(each => each.slug === slug)?.name ?? []).join(', ')}</b><span className="cs-ns-stamp">Waiting</span></div>
    <div className="cs-ns-row"><button className="cs-btn" onClick={() => setChanging(true)}>Change it</button></div>
  </>;
  return <form className="cs-sch" onSubmit={save}>
    <input className={box} aria-label="Your LinkedIn profile" placeholder="linkedin.com/in/your-name" autoComplete="off" inputMode="url" maxLength={200} required value={typed} onChange={event => setTyped(event.target.value)} />
    <div role="group" aria-label="Your schools">{schools.all.map(each => <button type="button" key={each.slug} className="cs-kit" data-kit={each.slug} disabled={each.slug === schools.home} aria-pressed={each.slug === schools.home || ticked.includes(each.slug)}
      onClick={() => setTicked(had => had.includes(each.slug) ? had.filter(one => one !== each.slug) : [...had, each.slug])}><i />{each.name}</button>)}</div>
    <button className="cs-btn go" disabled={busy}>Unlock</button>
    {message && <p role="alert">{message}</p>}
  </form>;
}
