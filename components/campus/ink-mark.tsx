import { inkBlot } from '@/lib/campus/ink-blot';

type Round = readonly [x: number, y: number, r: number];
const drops = (rounds: Round[]) => rounds.map(([x, y, r], at) => <circle key={at} cx={x} cy={y} r={r} />);
/** Two inks: a wide spill of the school's ink, a dark ink dropped into the middle of it, and between them the thin band where the dark one seeps out (lib/campus/ink-blot.ts). */
const Inks = ({ seed, cut = '' }: { seed: string; /** A shape left out of the dark ink, so the school's ink shows through it. */ cut?: string }) => { const blot = inkBlot(seed); return <><g className="school"><path d={blot.school} />{drops(blot.schoolDrops)}</g><path className="seep" fillRule="evenodd" d={blot.seep + cut} /><g className="dark"><path fillRule="evenodd" d={blot.dark + cut} />{drops(blot.darkDrops)}</g></>; };
/** A four-point spark at the middle of the blot: what says the mark stands for the paid plan. */
const SPARK = 'M0 -27Q3.5 -3.5 27 0Q3.5 3.5 0 27Q-3.5 3.5 -27 0Q-3.5 -3.5 0 -27Z';

/** What a face with Loop Ink sits on, in place of its plain circle: a blot of its own, made from the word given. It
    says nothing to a screen reader: that the person has Ink is in the name of the face. */
export const InkBlot = ({ seed }: { seed: string }) => <svg className="cs-blot" viewBox="-80 -80 160 160" aria-hidden="true"><Inks seed={seed} /></svg>;
/** The mark of Loop Ink: one small blot, always the same one, with a spark cut out of its middle (picked by the founder
    from public/demo/mockups-ink-icon.html, B). It is as big as the type it sits in, and says nothing to a screen
    reader: what it stands for is in the name of the thing that wears it. */
export const InkMark = () => <svg className="cs-ink" viewBox="-68 -68 136 136" aria-hidden="true"><Inks seed="Loop Ink" cut={SPARK} /></svg>;
/** The mark of a school's own animal: a graduation cap, worn where an Ink animal wears its blot. */
export const SchoolMark = () => <svg className="cs-ink" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 3 1.5 6.2 8 9.4l6.5-3.2z" /><path d="M4.3 8.6v2.3c1 .9 2.3 1.4 3.7 1.4s2.7-.5 3.7-1.4V8.6L8 10.5z" /></svg>;
