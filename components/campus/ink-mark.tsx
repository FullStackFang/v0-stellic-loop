import { inkBlot } from '@/lib/campus/ink-blot';

type Round = readonly [x: number, y: number, r: number];
const drops = (rounds: Round[]) => rounds.map(([x, y, r], at) => <circle key={at} cx={x} cy={y} r={r} />);
/** Two inks: a wide spill of the school's ink, a dark ink dropped into the middle of it, and between them the thin band where the dark one seeps out (lib/campus/ink-blot.ts). */
const Inks = ({ seed, cut = '' }: { seed: string; /** A shape left out of the dark ink, so the school's ink shows through it. */ cut?: string }) => { const blot = inkBlot(seed); return <><g className="school"><path d={blot.school} />{drops(blot.schoolDrops)}</g><path className="seep" fillRule="evenodd" d={blot.seep + cut} /><g className="dark"><path fillRule="evenodd" d={blot.dark + cut} />{drops(blot.darkDrops)}</g></>; };
/** A four-point spark at the middle of the blot: what says the mark stands for the paid plan. */
const SPARK = 'M0 -27Q3.5 -3.5 27 0Q3.5 3.5 0 27Q-3.5 3.5 -27 0Q-3.5 -3.5 0 -27Z';

/** What a face with Loopd Ink sits on, in place of its plain circle: a blot of its own, made from the word given. It
    says nothing to a screen reader: that the person has Ink is in the name of the face. */
export const InkBlot = ({ seed }: { seed: string }) => <svg className="cs-blot" viewBox="-80 -80 160 160" aria-hidden="true"><Inks seed={seed} /></svg>;
/** The marks of the two plans (openspec loop-ink-tiers, public/demo/mockups-ink-tiers.html): one small blot, always the
    same one. Alone it is Ink; with a spark cut out of its middle it is Ink+. A feature that comes with a plan wears its
    mark in place of the plan's name. It is as big as the type it sits in. With `named` a screen reader reads it as the
    plan; without, it says nothing, for where the plan is already in the name of the thing that wears it. */
export const InkMark = ({ plus = false, named = false }: { plus?: boolean; named?: boolean }) => <svg className="cs-ink" viewBox="-68 -68 136 136" {...named ? { role: 'img', 'aria-label': plus ? 'Ink+' : 'Ink' } : { 'aria-hidden': true }}><Inks seed="Loopd Ink" cut={plus ? SPARK : ''} /></svg>;
/** What an Ink+ face wears over its blot: three small sparks that twinkle in turn, still where motion is reduced. Laid
    over the face like the blot, and says nothing to a screen reader: the plan is in the name of the face. */
export const InkSparks = () => <span className="cs-sparks" aria-hidden="true">{[0, 1, 2].map(at => <svg key={at} viewBox="-30 -30 60 60"><path d={SPARK} /></svg>)}</span>;
/** The mark of a school's own animal: a graduation cap, worn where an Ink animal wears its blot. */
export const SchoolMark = () => <svg className="cs-ink" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 3 1.5 6.2 8 9.4l6.5-3.2z" /><path d="M4.3 8.6v2.3c1 .9 2.3 1.4 3.7 1.4s2.7-.5 3.7-1.4V8.6L8 10.5z" /></svg>;
