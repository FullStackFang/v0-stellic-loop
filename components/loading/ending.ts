// How a page-sized wait hands over to its ending (openspec loop-loading-seats, design D13). A loading fallback is
// removed the moment its page is ready, so the ending cannot be drawn in it: the ticket says here where it stood as it
// goes, and the layer at the top of the app (seats-ending.tsx) draws the splat there, over the page that has arrived.

/** Whose wait it is. `plan` picks the ink; `seed` is the word the member's own blot is made from (the one under their face). */
export type Plan = 'free' | 'ink' | 'plus';
export type Me = { face?: string | null; plan?: Plan; seed?: string };
export type Left = { box: { left: number; top: number; width: number; height: number }; face: string; plan: Plan; seed: string };

/** A ticket seen for less than this has no ending: a splat on a ticket nobody saw is noise. */
export const SEEN_MS = 400;
/** How long the loader waits before it shows at all, so a fast answer never flashes it. The same number is in seats.css. */
export const ARRIVE_MS = 150;

let hear: ((left: Left) => void) | null = null;
export function listen(heard: (left: Left) => void) { hear = heard; return () => { if (hear === heard) hear = null; }; }
export const leave = (left: Left) => hear?.(left);
