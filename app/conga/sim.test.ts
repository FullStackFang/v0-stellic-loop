// @vitest-environment node
import { expect, it } from 'vitest';
import { addLine, createWorld, FULL, POWERS, round, steer, step } from '@/public/conga/sim.js';

// The same game every run.
function seeded(seed: number) {
  return () => { seed = seed + 0x6d2b79f5 | 0; let v = Math.imul(seed ^ seed >>> 15, 1 | seed); v = v + Math.imul(v ^ v >>> 7, 61 | v) ^ v; return ((v ^ v >>> 14) >>> 0) / 4294967296; };
}

// What a frame costs follows how many animals there are and how much of its path each line remembers. The ground always
// refills and has no cap; what keeps a game drawable is that a really long line sheds from its back, faster the longer it
// is, and that if the lines together still pass FULL the game says so and the page starts a new round.
// The limits here are what a browser was measured to carry (2026-11-20): with the processor slowed four times, the page
// kept 60 frames a second with 800 animals in lines and 250 strays, and fell to 30 with a single line of 400.
// A rule that lets a game past them needs measuring again before it ships.
it('keeps the lines, the strays and the remembered paths within what a slow phone can draw, through a long game', () => {
  const random = seeded(7);
  const fresh = () => {
    const world = createWorld(random, round(), [], [{ name: 'Bus', from: [-1400, 0], to: [0, 0], off: [40, 40], riders: 18, ride: 36, stay: 5, away: 5 }] as never);
    for (let id = 0; id < 12; id++) addLine(world, { id, face: 1, name: `Line ${id}`, bot: { skill: 0.35 + random() * 0.65, aggro: random() } as never, start: 3 + Math.floor(random() * 14) });
    return world;
  };
  let world = fresh();
  const most = { line: 0, inLines: 0, strays: 0, path: 0, aboard: 0, longFor: 0 };
  let longFor = 0;
  for (let n = 0; n < 30 * 60 * 15; n++) {
    const events = step(world, 1 / 30) as { type: string }[];
    let inLines = 0, top = 0;
    for (const line of world.lines as { tail: unknown[]; path: unknown[] }[]) { inLines += line.tail.length; top = Math.max(top, line.tail.length); most.path = Math.max(most.path, line.path.length); }
    most.line = Math.max(most.line, top);
    longFor = top > 400 ? longFor + 1 / 30 : 0; most.longFor = Math.max(most.longFor, longFor);
    most.inLines = Math.max(most.inLines, inLines); most.strays = Math.max(most.strays, world.strays.length); most.aboard = Math.max(most.aboard, world.shuttles[0].load);
    if (events.some(event => event.type === 'full')) world = fresh(); // as the page does: a new round
    else if (inLines > FULL) most.inLines = Infinity; // past FULL only on the frame that says so
  }
  expect(most.line).toBeGreaterThan(30); // the game did go on long enough for lines to grow
  // A line can jump past 400 for a moment by taking a big sack, but sheds so fast up there that it never stays.
  expect(most.longFor).toBeLessThan(2);
  expect(most.inLines).toBeLessThan(FULL + 60); // one frame's gathering past it at the most
  expect(most.strays).toBeLessThanOrEqual(420);
  expect(most.path).toBeLessThan(5300); // a line of 800, standing 33 apart on points 5 apart
  expect(most.aboard).toBeLessThanOrEqual(40); // a car has seats, so it cannot hand one line hundreds at once
}, 120_000);

// A line that keeps gathering never shrinks on its own. One that goes ten seconds without picking anyone up starts to lose
// its back: those go home, so walking in circles where they were does not win them back.
it('lets a line keep its animals while it gathers, and lets the back wander off once it stops', () => {
  const world = createWorld(seeded(3), round(), []);
  world.strays.length = 0; world.feed = 0; // nothing to pick up
  const line = addLine(world, { id: 'me', face: 1, name: 'You', start: 40 }) as { a: number; tail: unknown[] };
  const run = (seconds: number) => { for (let n = 0; n < seconds * 30; n++) { steer(line as never, line.a + 1, false); step(world, 1 / 30); } };
  run(9.5);
  expect(line.tail.length).toBe(40);
  run(20.5);
  expect(line.tail.length).toBeLessThan(40);
  expect(line.tail.length).toBeGreaterThan(20); // slowly: about 0.56 a second at this length
});

// The three pickups: walked over, each does its one thing for a while, then wears off.
type Line = { x: number; y: number; a: number; tail: unknown[]; powers: Record<string, number> };
const alone = () => {
  const world = createWorld(seeded(5), round(), []) as never as { strays: { x: number; y: number; face: number; a: number; vx: number; vy: number }[]; items: { x: number; y: number; kind: string }[]; feed: number; lay: number };
  world.strays.length = 0; world.feed = 0; world.items.length = 0; world.lay = 0;
  const line = addLine(world, { id: 'me', face: 1, name: 'You', start: 20 }) as Line;
  Object.assign(line, { x: 0, y: 0, a: 0 }); steer(line as never, 0, false);
  return { world, line };
};

it('gives the megaphone to whoever walks over it, and lets it draw strays from twice as far until it wears off', () => {
  const { world, line } = alone();
  world.items.push({ x: 20, y: 0, kind: 'megaphone' });
  const events = step(world, 1 / 30) as { type: string; kind?: string }[];
  expect(events).toContainEqual(expect.objectContaining({ type: 'power', kind: 'megaphone' }));
  expect(world.items).toHaveLength(0);
  // A stray 250 away, beyond the usual 150 but inside the megaphone's 300, comes to the line.
  world.strays.push({ x: line.x + 200, y: line.y + 150, face: 1, a: 0, vx: 0, vy: 0 });
  const was = Math.hypot(world.strays[0].x - line.x, world.strays[0].y - line.y);
  step(world, 1 / 30);
  expect(Math.hypot(world.strays[0].x - line.x, world.strays[0].y - line.y)).toBeLessThan(was - 5);
  line.powers.megaphone = 0;
  world.strays[0] = { x: line.x + 200, y: line.y + 150, face: 1, a: 0, vx: 0, vy: 0 };
  const far = Math.hypot(world.strays[0].x - line.x, world.strays[0].y - line.y);
  step(world, 1 / 30);
  expect(Math.hypot(world.strays[0].x - line.x, world.strays[0].y - line.y)).toBeGreaterThan(far - 5); // out of reach again
});

it('lets a line dash for free with coffee', () => {
  const { world, line } = alone();
  line.powers.coffee = POWERS.coffee;
  for (let n = 0; n < 60; n++) { steer(line as never, line.a + 1, true); step(world, 1 / 30); }
  expect(line.tail.length).toBe(20);
  line.powers.coffee = 0;
  for (let n = 0; n < 60; n++) { steer(line as never, line.a + 1, true); step(world, 1 / 30); }
  expect(line.tail.length).toBeLessThan(20);
});

// A long line scattered leaves its animals as one mob where it fell; a head that reaches it draws the whole mob in.
it('leaves a scattered line as one mob that a head draws in whole, and that breaks up if nobody comes', () => {
  const world = createWorld(seeded(11), round(), []) as never as { strays: unknown[]; feed: number; items: unknown[]; lay: number; mobs: { x: number; y: number; faces: number[] }[] };
  world.strays.length = 0; world.feed = 0; world.items.length = 0; world.lay = 0;
  const big = addLine(world, { id: 'big', face: 1, name: 'Glee Club', start: 30 }) as Line & { safe: number; dead: number };
  const small = addLine(world, { id: 'small', face: 2, name: 'Risley', start: 3 }) as Line & { safe: number; dead: number };
  // The big line's head walks into the small line's back.
  // The big line lies along the x axis heading east; the small one heads south across its path, its back just ahead of the big head.
  Object.assign(big, { x: 0, y: 0, a: 0, want: 0, safe: 0, path: [{ x: 0, y: 0 }, { x: -2000, y: 0 }] });
  Object.assign(small, { x: 10, y: 60, a: Math.PI / 2, want: Math.PI / 2, safe: 0, path: [{ x: 10, y: 60 }, { x: 10, y: -400 }] });
  (big.tail as { x: number; y: number }[]).forEach((f, i) => Object.assign(f, { x: -33 * (i + 1), y: 0 }));
  (small.tail as { x: number; y: number }[]).forEach((f, i) => Object.assign(f, { x: 10, y: 60 - 33 * (i + 1) }));
  const events = step(world, 1 / 30) as { type: string; size?: number }[];
  expect(events).toContainEqual(expect.objectContaining({ type: 'spill', size: 30, piles: 3 }));
  // Thirty burst into three sacks flung away from where the line fell, none of them loose.
  expect(world.mobs).toHaveLength(3);
  expect(world.mobs.reduce((sum, mob) => sum + mob.faces.length, 0)).toBe(30);
  expect(world.strays).toHaveLength(0);
  for (const mob of world.mobs) expect(Math.hypot(mob.x - big.x, mob.y - big.y)).toBeGreaterThan(100);
  // A sack in the air cannot be taken.
  const mob = world.mobs[0], held = mob.faces.length, before = small.tail.length;
  Object.assign(small, { x: mob.x + 20, y: mob.y }); steer(small as never, 0, false);
  expect(step(world, 1 / 30)).not.toContainEqual(expect.objectContaining({ type: 'grab' }));
  // Landed, the small line takes it whole, and its animals step into the line one after another, not all at once.
  for (let n = 0; n < 30; n++) { Object.assign(small, { x: mob.x + 20, y: mob.y }); step(world, 1 / 30); }
  expect(world.mobs).not.toContain(mob);
  expect(small.tail.length).toBeLessThan(before + held);
  for (let n = 0; n < 60; n++) step(world, 1 / 30);
  expect(small.tail.length).toBe(before + held);
  world.mobs.length = 0;
  // A mob nobody reaches stays whole for a while, then breaks up into strays.
  world.mobs.push({ x: -800, y: 0, faces: Array(20).fill(1), from: 'x', born: (world as never as { t: number }).t, leak: 0 } as never);
  Object.assign(small, { x: 800, y: 0 });
  for (let n = 0; n < 30 * 11; n++) { steer(small as never, small.a + 1, false); step(world, 1 / 30); }
  expect(world.mobs[0].faces).toHaveLength(20);
  for (let n = 0; n < 30 * 10; n++) { steer(small as never, small.a + 1, false); step(world, 1 / 30); }
  expect(world.mobs).toHaveLength(0);
  expect(world.strays.length).toBeGreaterThan(0);
});

it('keeps the bus from taking anyone off a line with the whistle', () => {
  const run = (whistle: boolean) => {
    const world = createWorld(seeded(9), round(), [], [{ name: 'Bus', from: [-1400, 0], to: [1400, 0], off: [1400, 0], riders: 0, ride: 20, stay: 5, away: 5 }] as never) as never as { strays: unknown[]; feed: number; items: unknown[]; lay: number };
    world.strays.length = 0; world.feed = 0; world.items.length = 0; world.lay = 0;
    const line = addLine(world, { id: 'me', face: 1, name: 'You', start: 20 }) as Line & { safe: number };
    Object.assign(line, { x: 0, y: 30, a: Math.PI / 2, safe: 0 });
    const events: { type: string }[] = [];
    for (let n = 0; n < 30 * 20; n++) {
      if (whistle) line.powers.whistle = POWERS.whistle;
      Object.assign(line, { x: 0, y: 30 }); // held still on the bus's road, so the bus runs into it
      events.push(...step(world, 1 / 30) as { type: string }[]);
    }
    return events.filter(event => event.type === 'lift').length;
  };
  expect(run(false)).toBeGreaterThan(0);
  expect(run(true)).toBe(0);
});

// Trees stand on the ground as things to walk round: nobody can stand on the foot of a trunk.
it('makes every tree on both grounds solid at its trunk', async () => {
  const { MAPS } = await import('@/public/conga/maps.js');
  const { inside } = await import('@/public/conga/sim.js');
  for (const map of Object.values(MAPS) as { rings: number[][][]; holes: number[][][]; shuttles?: never[]; trees: { x: number; y: number; r: number }[] }[]) {
    const world = createWorld(seeded(3), map.rings, map.holes, map.shuttles ?? []);
    expect(map.trees.length).toBeGreaterThan(10);
    for (const tree of map.trees) expect(inside(world, tree.x, tree.y + tree.r * 0.6)).toBe(false);
  }
});
