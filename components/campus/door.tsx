'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { Rings } from '@/components/LoopGlyphs';
import { DoorSignIn } from './door-sign-in';
import { Tile } from './screen';

// The front door, signed out: the pitch, a ticket to try, and the sign-in card. Picked from
// public/demo/mockups-door-schools.html (direction B). The page wears the colours of the school whose ticket is on
// top. The seats are a try-out: they show no real person and no real count, only animals, and nothing is saved.

export type DoorSchool = {
  slug: string; name: string; domains: string[];
  /** The school's next event this week. Title and time only, never people. */
  event: { title: string; day: string; time: string; line: string } | null;
  /** The group reward on that event, when the school has one. */
  reward: { need: number; text: string } | null;
};

/** Shown, and said to be an example, on an event that has no reward of its own. */
const EXAMPLE = { need: 3, text: 'Coffee for the table' };
/** Shown, and said to be an example, for a school with nothing on this week, so there is still a ticket to try. */
const SAMPLES = [['Thu', '7:00 PM', 'Board game night'], ['Fri', '5:30 PM', 'Sunset run'], ['Sat', '11:00 AM', 'Farmers market walk'], ['Wed', '6:00 PM', 'Film night']] as const;
/** public/animals: 36 icons by Tran Mau Tri Tam, CC BY 4.0. */
const ANIMALS = 36, animal = (n: number) => `/animals/${String(n % ANIMALS + 1).padStart(2, '0')}.png`;
/** Each school's name is set in its own cut of Archivo: [width, weight]. */
const CUTS = [[125, 800], [78, 600], [62, 900], [100, 360]] as const;
const cut = (at: number): CSSProperties => ({ fontStretch: `${CUTS[at % CUTS.length][0]}%`, fontWeight: CUTS[at % CUTS.length][1] });
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sitting = (school: number, seat: number) => (school * 7 + seat * 5 + 3) % ANIMALS;

/** Make a change, and let its colours spread from the thing that caused it. */
function wipe(from: Element | null | undefined, change: () => void) {
  const root = document.documentElement;
  if (!from || calm() || typeof document.startViewTransition !== 'function') return change();
  const box = from.getBoundingClientRect();
  root.style.setProperty('--cs-vx', `${box.left + box.width / 2}px`); root.style.setProperty('--cs-vy', `${box.top + box.height / 2}px`);
  root.classList.add('cs-wiping');
  const done = () => root.classList.remove('cs-wiping');
  document.startViewTransition(() => flushSync(change)).finished.then(done, done);
}

export function Door({ schools, start, routing, configured }: { schools: DoorSchool[]; start: number; routing: 'hash' | 'path'; configured: boolean }) {
  const [at, setAt] = useState(start), [was, setWas] = useState<number | null>(null);
  /** Your animal once you have taken a seat, and whether you brought one more. */
  const [mine, setMine] = useState<number | null>(null), [friend, setFriend] = useState(false);
  const deck = useRef<HTMLDivElement>(null), hold = useRef(0), grab = useRef<{ x: number; y: number; el: HTMLElement } | null>(null);
  const school = schools[at], many = schools.length > 1, around = (n: number) => ((n % schools.length) + schools.length) % schools.length;
  const reward = school?.reward ?? EXAMPLE, others = reward.need - 2, have = others + (mine === null ? 0 : 1) + (friend ? 1 : 0), left = reward.need - have, won = !!school && left === 0;
  const sample = SAMPLES[at % SAMPLES.length], event = school?.event ?? { day: sample[0], time: sample[1], title: sample[2], line: null };

  /** Leave the ticket alone for a while: someone is using it. */
  const rest = (ms = 12000) => { hold.current = Math.max(hold.current, Date.now() + ms); };
  const go = (to: number, from?: Element | null) => {
    const next = around(to);
    if (next !== at) wipe(from, () => { setWas(at); setAt(next); setMine(null); setFriend(false); });
  };
  const sit = (from: Element) => {
    rest();
    if (mine === null) { const taken = Array.from({ length: others }, (_, seat) => sitting(at, seat)); let pick = Math.floor(Math.random() * ANIMALS); while (taken.includes(pick)) pick = (pick + 1) % ANIMALS; setMine(pick); }
    else wipe(from, () => setFriend(true));
  };
  const leave = () => { rest(); setMine(null); setFriend(false); };

  // The next school comes up by itself, unless someone is using the ticket or typing their email.
  useEffect(() => {
    if (!many || calm()) return;
    const turn = setInterval(() => { if (Date.now() >= hold.current && !document.hidden && !grab.current) go(at + 1, deck.current?.querySelector('.cs-dtab')); }, 4200);
    return () => clearInterval(turn);
  });
  useEffect(() => {
    if (!many) return;
    const key = (event: KeyboardEvent) => {
      const way = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!way || (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]'))) return;
      rest(); go(at + way, deck.current?.querySelector('.cs-dtk'));
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  // The ticket leans away from the pointer, and can be thrown in any direction for the next school.
  const lean = (event: PointerEvent) => {
    const el = deck.current; if (!el || calm()) return;
    const box = el.getBoundingClientRect(), by = (v: number, mid: number) => Math.max(-1, Math.min(1, (v - mid) / 420)).toFixed(3);
    el.style.setProperty('--px', by(event.clientX, box.left + box.width / 2)); el.style.setProperty('--py', by(event.clientY, box.top + box.height / 2));
  };
  const down = (event: PointerEvent<HTMLElement>) => {
    if (!many || (event.target as Element).closest('button')) return;
    grab.current = { x: event.clientX, y: event.clientY, el: event.currentTarget };
    event.currentTarget.classList.add('drag'); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    const held = grab.current; if (!held) return;
    const dx = event.clientX - held.x, dy = event.clientY - held.y;
    held.el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 28}deg)`;
  };
  const up = (event: PointerEvent) => {
    const held = grab.current; if (!held) return;
    const dx = event.clientX - held.x, dy = event.clientY - held.y, next = () => go(at + (dx < 0 ? 1 : -1), held.el);
    grab.current = null; rest();
    if (Math.hypot(dx, dy) <= 90) { held.el.classList.remove('drag'); held.el.style.transform = ''; return; }
    if (calm() || typeof held.el.animate !== 'function') return next();
    held.el.animate([{ transform: held.el.style.transform }, { transform: `translate(${dx * 4}px, ${dy * 4}px) rotate(${dx / 7}deg)`, opacity: 0 }], { duration: 240, easing: 'ease-in', fill: 'forwards' }).finished.then(next, next);
  };
  /** The sign-in card spotted a school in the email being typed: show that school, and stop turning. */
  const spot = (slug: string | null) => {
    hold.current = Infinity;
    const found = schools.findIndex(each => each.slug === slug);
    if (found >= 0) go(found, document.querySelector('.cs-door-in'));
  };

  const seats = school ? Array.from({ length: reward.need }, (_, seat) => {
    // eslint-disable-next-line @next/next/no-img-element -- a 192px icon from public/animals
    if (seat < others) return <i key={seat} className="cs-dseat pet"><img src={animal(sitting(at, seat))} alt="" /></i>;
    // eslint-disable-next-line @next/next/no-img-element -- a 192px icon from public/animals
    if (seat === others && mine !== null) return <button key="you" className="cs-dseat you" aria-label="Your seat. Give it up" onClick={leave}><img src={animal(mine)} alt="" /><b>You</b></button>;
    // eslint-disable-next-line @next/next/no-img-element -- a 192px icon from public/animals
    if (seat < have) return <i key={seat} className="cs-dseat pet new"><img src={animal(sitting(at, seat) + 11)} alt="" /></i>;
    return <button key={seat} className={`cs-dseat ${seat === have ? 'next' : ''}`} aria-label="Take a seat" onClick={press => sit(press.currentTarget)} />;
  }) : null;

  return <div className={`cs-doorway ${won ? 'won' : ''}`} data-kit={school?.slug}>
    <header className="cs-nav">
      <Link className="cs-wm" href="/"><Rings />Loop</Link>
      {many && <div className="cs-dots" role="group" aria-label="Schools">{schools.map((each, to) => <button key={each.slug} data-kit={each.slug} aria-pressed={to === at} aria-label={each.name} onClick={press => { rest(); go(to, press.currentTarget); }}>{to === at && each.name}</button>)}</div>}
    </header>
    <main className="cs-door" onPointerMove={lean}>
      <div className="cs-door-say">
        {school
          ? <h1><span>Go together</span>{' '}<span>at <span className="cs-roll">{was !== null && was !== at && <em key={`was-${schools[was].slug}`} className="out" style={cut(was)} aria-hidden="true">{schools[was].name}.</em>}<em key={school.slug} style={cut(at)}>{school.name}.</em></span></span></h1>
          : <h1><span>Go together.</span>{' '}<span>Get more for it.</span></h1>}
        <p>Events from your campus and plans posted by people near you. Show up as a group and the reward unlocks.</p>
        {school && <div className="cs-deck" ref={deck} onPointerMove={() => rest(5000)}>
          {[1, 2, 3].filter(k => k < schools.length).map(k => { const other = schools[around(at + k)]; return <button key={other.slug} className="cs-dtab" data-kit={other.slug} style={{ '--k': k } as CSSProperties} aria-label={`Show ${other.name}`} onClick={press => { rest(); go(at + k, press.currentTarget); }}><span>{other.name}</span></button>; })}
          <article key={school.slug} className="cs-dtk" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <div className="cs-dtk-top"><Tile top={event.day} big={event.time} met={won} /><div><h3>{event.title}</h3><p>{event.line ?? <><span className="cs-pill src">Example</span>{school.name}</>}</p></div></div>
            <div className={`cs-dtk-stub ${won ? 'met' : mine !== null ? 'near' : ''}`}>
              <div><small>{school.reward ? `A group of ${reward.need} gets` : `For example, a group of ${reward.need} gets`}</small><strong>{reward.text}</strong><em>{won ? 'Show this at the counter, together.' : `${left} more and it unlocks`}</em></div>
              <div className="cs-dseats">{seats}{won && <b className="cs-stamp">Unlocked</b>}</div>
              {won ? many && <button className="cs-btn go" onClick={press => { rest(); go(at + 1, press.currentTarget); }}>Next: {schools[around(at + 1)].name}</button>
                : <button className="cs-btn go" onClick={press => sit(press.currentTarget)}>{mine === null ? 'I’m in' : 'Bring one more'}</button>}
            </div>
          </article>
        </div>}
        {school && <p className="cs-tip">Try it: take a seat to see a reward unlock.{many && ' Flick the ticket, or tap a school behind it, for the next one.'}</p>}
        {school && <p className="cs-credit">Animal icons by <a href="https://www.figma.com/community/file/1514963172455082116" target="_blank" rel="noreferrer">Tran Mau Tri Tam</a>, CC BY 4.0.</p>}
      </div>
      <div onFocusCapture={() => { hold.current = Infinity; }}>
        <DoorSignIn routing={routing} configured={configured} schools={schools.map(({ slug, name, domains }) => ({ slug, name, domains }))} kit={school?.slug} onSpot={spot} />
      </div>
    </main>
  </div>;
}
