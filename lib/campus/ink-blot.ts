/** The blot a member with Loopd Ink sits on, in place of the plain circle behind a face: a wide spill of the school's
    ink with a dark ink dropped into the middle of it and seeping a little way out into it, and a few drops thrown
    off each. It is worked out from a word (the member's name and picture), so the same member always gets the same
    blot and no two members match.
    Picked by the founder from public/demo/mockups-ink-blot-3.html (C, "Seeping"). Plain shapes only, no filters, so a
    page of faces costs nothing to draw. Everything is in a box where the face is 100 across and sits at the middle. */

type Round = readonly [x: number, y: number, r: number];
export type InkBlot = { school: string; seep: string; dark: string; schoolDrops: Round[]; darkDrops: Round[] };

const TURN = Math.PI * 2, STEPS = 96;
const hash = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
/** A run of numbers from 0 to 1 that is the same every time for the same start. */
function run(seed: number) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const out = (angle: number, far: number) => [Math.cos(angle) * far, Math.sin(angle) * far] as const;
const fix = (n: number) => Math.round(n * 10) / 10;

/** A pool of ink as overlapping rounds: a body, six swells round it, and one place where it ran a little. */
function pool(next: () => number, r: number) {
  const spin = next() * TURN, ran = next() * TURN, rounds: Round[] = [[0, 0, r]];
  for (let i = 0; i < 6; i++) rounds.push([...out(spin + (i + (next() - .5) * .4) / 6 * TURN, r - 20 + next() * 4), 22 + next() * 4]);
  rounds.push([...out(ran, r + 1), 11], [...out(ran, r + 10), 6]);
  return { rounds, ran };
}
const sway = (waves: readonly (readonly [times: number, size: number, shift: number])[], angle: number) => waves.reduce((sum, [times, size, shift]) => sum + Math.sin(angle * times + shift) * size, 0);
const drawn = (reach: number[]) => 'M' + reach.map((far, at) => out(at / STEPS * TURN, far).map(fix).join(' ')).join('L') + 'Z';
/** How far a pool of ink reaches in each direction: the creases between rounds softened the way a liquid closes them,
    then a slow sway and a slight tremble so the edge is not machine-smooth. */
function edge(rounds: Round[], next: () => number) {
  let reach = Array.from({ length: STEPS }, (_, at) => {
    const angle = at / STEPS * TURN; let far = 0;
    for (const [x, y, r] of rounds) {
      const from = Math.hypot(x, y), off = angle - Math.atan2(y, x), under = r * r - (from * Math.sin(off)) ** 2;
      if (under >= 0) far = Math.max(far, from * Math.cos(off) + Math.sqrt(under));
    }
    return far;
  });
  for (let pass = 0; pass < 2; pass++) reach = reach.map((far, at) => (reach[(at + STEPS - 1) % STEPS] + far * 2 + reach[(at + 1) % STEPS]) / 4);
  const waves = ([[2, 2], [3, 1.6], [5, 1.1], [13, .5], [29, .3]] as const).map(([times, size]) => [times, size, next() * TURN] as const);
  return reach.map((far, at) => far + sway(waves, at / STEPS * TURN));
}
/** Where the dark ink has crept out into the school's: a thin band past its edge, wider in some places than others. */
function crept(reach: number[], next: () => number) {
  const waves = ([[4, 1.3], [9, .9], [17, .5]] as const).map(([times, size]) => [times, size, next() * TURN] as const);
  return reach.map((far, at) => far + 3.4 + sway(waves, at / STEPS * TURN));
}
/** Small round drops thrown off to one side, a few near and a few far. */
function thrown(next: () => number, toward: number, from: number, count: number, wide = 1.2): Round[] {
  return Array.from({ length: count }, () => { const [x, y] = out(toward + (next() - .5) * wide, from + 2 + next() * 22); return [fix(x), fix(y), fix(2 + next() * next() * 2.8)] as const; });
}

const made = new Map<string, InkBlot>();
export function inkBlot(seed: string): InkBlot {
  const known = made.get(seed); if (known) return known;
  const next = run(hash(seed)), wide = pool(next, 55), middle = pool(next, 41);
  const blot = { schoolDrops: thrown(next, wide.ran + 2.5 + next() * 1.5, 68, 3), darkDrops: thrown(next, middle.ran + 2.2 + next() * 1.8, 58, 5), school: drawn(edge(wide.rounds, next)), dark: '', seep: '' }, dark = edge(middle.rounds, next);
  blot.dark = drawn(dark); blot.seep = drawn(crept(dark, next));
  made.set(seed, blot);
  return blot;
}

/** The drops a blot throws when it lands as a splat, at the end of a wait (components/loading). They go to the right
    only, away from the words and faces beside the splat. Their own run of numbers, so the blot under a face is as it was. */
const flung = new Map<string, Round[]>();
export function inkFlung(seed: string): Round[] {
  const known = flung.get(seed); if (known) return known;
  const drops = thrown(run(hash(`${seed} splat`)), 0, 62, 7, 3.2);
  flung.set(seed, drops);
  return drops;
}
