'use client';

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { animal } from '@/lib/campus/animals';
import { inkBlot } from '@/lib/campus/ink-blot';
import { ARRIVE_MS, HOLD_MS, leave, SEEN_MS, type Me, type Plan } from './ending';
import { lastBar } from './last-bar';

// "Saving seats", the one loader of the app (openspec loop-loading-seats). Two sizes: the ticket for a whole page, and
// the small one ("Your blot") for a button, a row, or a part of a page. Styles are in seats.css, loaded by the root layout.

/** The one line every loader says. A constant and not a prop, so no place can drift from it (design D12). */
export const LINE = 'Looping you in…';
/** The animals in the seats, the same on the server and in the browser: octopus, chicken, fox. */
const SEATS = [4, 7, 16];
/** Whose face it is when the viewer is not known: the penguin. */
const SPARE = 11;

const Known = createContext<Me>({});
/** Tells every loader under it whose wait it is, so a button deep in a page shows the viewer's own face and blot. */
export const SeatsMe = ({ me, children }: { me: Me; children: ReactNode }) => <Known.Provider value={me}>{children}</Known.Provider>;
/** What is given wins over what is known from above, then what the person's avatar last said (last-bar.ts); what nobody knows is a free animal on the free plan. */
export function useMe(given: Me = {}): { face: string; plan: Plan; seed: string } {
  const above = useContext(Known), last = lastBar().me;
  return { face: given.face || above.face || last.face || animal(SPARE), plan: given.plan ?? above.plan ?? last.plan ?? 'free', seed: given.seed ?? above.seed ?? last.seed ?? 'Loopd' };
}

/** The ticket's face, with no behaviour: the line, four seats, and a blank stub. `still` is the finished pose. */
export function TicketFace({ face, slow, filled, still }: { face: string; slow?: boolean; filled?: string | null; still?: boolean }) {
  const last = slow ? filled ?? null : face;
  return <>
    <span className="seats-main"><b>{LINE}</b><span className="seats-row">
      {SEATS.map((n, i) => <span key={n}><img style={{ '--i': i } as CSSProperties} src={animal(n)} alt="" fetchPriority={i ? undefined : 'high'} /></span>)}
      <span className="seats-mine">{last && <img style={{ '--i': 3 } as CSSProperties} src={last} alt="" />}</span>
    </span></span>
    <span className={`seats-stub${still ? ' seats-still' : ''}`} aria-hidden="true" />
  </>;
}

/**
 * The ticket: seats fill one at a time with faces, the last one the viewer's own. `slow` is for a wait known to be long
 * (drawing a pet): the seats fill once across about 25 seconds and the last, ringed seat stays empty until `filled` gives it its picture.
 * `page` marks a ticket that stands for a whole page: when it goes, it hands over to the splat ending. `quiet` is for a
 * ticket under a heading that already announces the wait: it says nothing to a screen reader.
 */
export function SeatsTicket({ slow, filled, page, quiet, ...given }: Me & { slow?: boolean; filled?: string | null; page?: boolean; quiet?: boolean }) {
  const me = useMe(given), root = useRef<HTMLSpanElement>(null), told = useRef(me);
  told.current = me;
  useEffect(() => {
    if (!page) return;
    let box: DOMRect | null = null;
    const seen = setTimeout(() => { box = root.current?.getBoundingClientRect() ?? null; }, ARRIVE_MS + SEEN_MS);
    return () => { clearTimeout(seen); if (box?.width) leave({ box: { left: box.left, top: box.top, width: box.width, height: box.height }, ...told.current }); };
  }, [page]);
  return <span ref={root} className={`seats-tk${slow ? ' seats-slow' : ''}`} role={quiet ? undefined : 'status'} aria-hidden={quiet || undefined}><TicketFace face={me.face} slow={slow} filled={filled} /></span>;
}

/**
 * Whether a loader is on screen for a wait that is `on`. It waits ARRIVE_MS, so a fast answer shows nothing; once it has
 * shown it stays at least HOLD_MS, so it never blips.
 */
export function useShown(on: boolean) {
  const [shown, setShown] = useState(false), since = useRef(0);
  useEffect(() => {
    if (on === shown && on) return;
    if (!on && !shown) return;
    const timer = on ? setTimeout(() => { since.current = Date.now(); setShown(true); }, ARRIVE_MS) : setTimeout(() => setShown(false), Math.max(0, since.current + HOLD_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [on, shown]);
  return shown;
}

/**
 * What a button says. While its own press is being answered (`on`) and the answer is slow, the small one and one short
 * word with no ellipsis (design D10); otherwise its own words (the children). The button is disabled meanwhile by its
 * owner, and the word is what a screen reader hears.
 */
export function SeatsWord({ on, word, plate, children }: { on: boolean; word: ReactNode; plate?: boolean; children: ReactNode }) {
  return useShown(on) ? <span className="seats-hold"><SeatsSmall plate={plate} />{word}</span> : <>{children}</>;
}

/** The small one and its line over a positioned box (a frame, a picture) while what goes in it is on its way. */
export function SeatsOver({ on, plate }: { on: boolean; plate?: boolean }) {
  return useShown(on) ? <span className="seats-over"><SeatsSmall line plate={plate} /></span> : null;
}

/** The blot under the small one's face. With Ink it is the member's own, in the school's two inks; otherwise one plain shape. */
function Blot({ plan, seed }: { plan: Plan; seed: string }) {
  const blot = inkBlot(seed), drop = ([x, y, r]: readonly [number, number, number], at: number) => <circle key={at} className="seats-drop" style={{ '--dx': `${-x * .7}px`, '--dy': `${-y * .7}px` } as CSSProperties} cx={x} cy={y} r={r * 1.3} />;
  return <svg viewBox="-80 -80 160 160" className={plan === 'free' ? 'seats-free' : undefined}>
    {plan === 'free' ? <path className="seats-body seats-dark" d={blot.dark} /> : <>
      <g className="seats-body"><path className="seats-school" d={blot.school} /><path className="seats-seep" d={blot.seep} /><path className="seats-dark" d={blot.dark} /></g>
      <g className="seats-school">{blot.schoolDrops.map(drop)}</g><g className="seats-dark">{blot.darkDrops.map(drop)}</g>
    </>}
  </svg>;
}

/**
 * The small one, "Your blot": the viewer's own face with their ink welling up under it (design D14). Inside a button or
 * a row it says nothing to a screen reader: the button's own waiting word does. With `line` it stands for a late part
 * of a page, and carries the line under it. `plate` is for a button filled with the action colour, where the dark ink
 * would not show.
 */
export function SeatsSmall({ line, plate, size, ...given }: Me & { line?: boolean; plate?: boolean; size?: number }) {
  const me = useMe(given);
  const small = <span className={`seats-sm${plate ? ' seats-plate' : ''}`} style={size ? { '--s': `${size}px` } as CSSProperties : undefined} aria-hidden="true"><Blot plan={me.plan} seed={me.seed} /><img src={me.face} alt="" /></span>;
  return line ? <span className="seats-part" role="status">{small}<span className="seats-say">{LINE}</span></span> : small;
}
