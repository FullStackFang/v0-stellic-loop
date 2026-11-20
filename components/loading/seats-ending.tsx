'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { inkBlot, inkFlung } from '@/lib/campus/ink-blot';
import { listen, type Left, type Plan } from './ending';
import { TicketFace } from './seats';

// The ending of a page-sized wait (openspec loop-loading-seats, design D13): a small ink splat stamps the ticket's
// blank stub, the ticket takes the knock and drops away. It is drawn here, in one layer at the top of the app, over the
// page that has already arrived; it takes no presses and is gone in under a second.

/** The four-point spark of the Ink mark (components/campus/ink-mark.tsx). */
const SPARK = 'M0 -27Q3.5 -3.5 27 0Q3.5 3.5 0 27Q-3.5 3.5 -27 0Q-3.5 -3.5 0 -27Z';
/** How long the ending plays, with a little room: the layer removes itself after this even if the browser never says the animation ended. */
const GONE_MS = 1000;
type Round = readonly [x: number, y: number, r: number];

/**
 * The splat, by plan. Free: one small shape of plain ink. Ink: the member's own blot in the school's two inks. Ink+: that
 * blot with a spark in its middle and sparks thrown round it, in a bright third ink.
 */
export function Splat({ plan, seed }: { plan: Plan; seed: string }) {
  const blot = inkBlot(seed), free = plan === 'free', plus = plan === 'plus';
  let n = 0;
  const flown = ([x, y]: Round) => ({ '--n': n++, '--dx': `${-x * .8}px`, '--dy': `${-y * .8}px` }) as CSSProperties;
  const round = (drop: Round) => <circle key={n} className="seats-drop" style={flown(drop)} cx={drop[0]} cy={drop[1]} r={drop[2] * 1.15} />;
  const spark = (drop: Round) => <path key={n} className="seats-drop" style={flown(drop)} d={SPARK} transform={`translate(${drop[0]} ${drop[1]}) scale(${(drop[2] / 27 * 2.9).toFixed(2)})`} />;
  const far = free ? blot.darkDrops.slice(0, 3) : plus ? [...blot.darkDrops, ...inkFlung(seed)] : [...blot.darkDrops, ...inkFlung(seed).slice(0, 3)];
  // Nothing lands to the left of the pool, where the line and the faces are.
  const clear = ([x]: Round) => x > -46;
  return <svg className={`seats-splat seats-${plan}`} viewBox="-90 -90 180 180">
    <g className="seats-body">{!free && <><path className="seats-school" d={blot.school} /><path className="seats-seep" d={blot.seep} /></>}<path className="seats-dark" d={blot.dark} />{plus && <path className="seats-third" d={SPARK} transform="scale(1.05)" />}</g>
    {!free && <g className="seats-school">{blot.schoolDrops.filter(clear).map(round)}</g>}
    <g className={plus ? 'seats-third' : 'seats-dark'}>{far.filter(clear).map(plus ? spark : round)}</g>
  </svg>;
}

/** Mounted once, in the root layout. Draws nothing until a page-sized ticket goes, and nothing at all under reduced motion. */
export function SeatsEnding() {
  const [left, setLeft] = useState<(Left & { at: number }) | null>(null);
  useEffect(() => listen(next => { if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return; setLeft({ ...next, at: Date.now() }); }), []);
  useEffect(() => { if (!left) return; const gone = setTimeout(() => setLeft(null), GONE_MS); return () => clearTimeout(gone); }, [left]);
  if (!left) return null;
  return <span key={left.at} className="seats-end" aria-hidden="true" style={left.box} onAnimationEnd={event => { if (event.target === event.currentTarget) setLeft(null); }}>
    <span className="seats-tk"><TicketFace face={left.face} still /></span><Splat plan={left.plan} seed={left.seed} />
  </span>;
}
