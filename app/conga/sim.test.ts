// @vitest-environment node
import { expect, it } from 'vitest';
import { addLine, createWorld, POWERS, round, steer, step } from '@/public/conga/sim.js';

// The same game every run.
function seeded(seed: number) {
  return () => { seed = seed + 0x6d2b79f5 | 0; let v = Math.imul(seed ^ seed >>> 15, 1 | seed); v = v + Math.imul(v ^ v >>> 7, 61 | v) ^ v; return ((v ^ v >>> 14) >>> 0) / 4294967296; };
}

// What a frame costs follows how many animals there are and how much of its path each line remembers. The rules keep
// both from growing as a game goes on: the world holds a fixed budget of animals, so no new ones appear once lines hold
// most of them, and strays over the cap are taken away. A line has no longest length; it loses animals only by dashing or
// by going a while without picking anyone up.
// The limits here are well inside what a browser was measured to carry (2026-11-20): with the processor slowed four times, the
// page kept 60 frames a second with 800 animals in lines and 250 strays, and fell to 30 with a single line of 400.
// A rule that lets a game past them needs measuring again before it ships.
it('keeps the lines, the strays and the remembered paths within what a slow phone can draw, through a long game', () => {
  const random = seeded(7);
  const world = createWorld(random, round(), [], [{ name: 'Bus', from: [-1400, 0], to: [0, 0], off: [40, 40], riders: 18, ride: 36, stay: 5, away: 5 }] as never);
  for (let id = 0; id < 12; id++) addLine(world, { id, face: 1, name: `Line ${id}`, bot: { skill: 0.35 + random() * 0.65, aggro: random() } as never, start: 3 + Math.floor(random() * 14) });
  const lines = world.lines as { tail: unknown[]; path: unknown[] }[];
  const most = { line: 0, inLines: 0, strays: 0, path: 0, aboard: 0 };
  for (let n = 0; n < 30 * 60 * 15; n++) {
    step(world, 1 / 30);
    let inLines = 0;
    for (const line of lines) { inLines += line.tail.length; most.line = Math.max(most.line, line.tail.length); most.path = Math.max(most.path, line.path.length); }
    most.inLines = Math.max(most.inLines, inLines); most.strays = Math.max(most.strays, world.strays.length); most.aboard = Math.max(most.aboard, world.shuttles[0].load);
  }
  expect(most.line).toBeGreaterThan(30); // the game did go on long enough for lines to grow
  expect(most.inLines).toBeLessThan(800); // and so no one line passes it either
  expect(most.strays).toBeLessThanOrEqual(420);
  expect(most.path).toBeLessThan(5300); // a line of the whole budget, 800, standing 33 apart on points 5 apart
  expect(most.aboard).toBeLessThanOrEqual(40); // a car has seats, so it cannot hand one line hundreds at once
});

// A line that keeps gathering never shrinks on its own. One that goes ten seconds without picking anyone up starts to lose
// its back, and walking in circles over the ones it lost does not win them back.
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
  const world = createWorld(seeded(5), round(), []) as { strays: { x: number; y: number; face: number; a: number; vx: number; vy: number }[]; items: { x: number; y: number; kind: string }[]; feed: number; lay: number };
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

it('keeps the bus from taking anyone off a line with the whistle', () => {
  const run = (whistle: boolean) => {
    const world = createWorld(seeded(9), round(), [], [{ name: 'Bus', from: [-1400, 0], to: [1400, 0], off: [1400, 0], riders: 0, ride: 20, stay: 5, away: 5 }] as never) as { strays: unknown[]; feed: number; items: unknown[]; lay: number };
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
