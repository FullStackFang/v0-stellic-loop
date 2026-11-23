// @vitest-environment node
import { expect, it } from 'vitest';
import { addLine, BIG, createWorld, FULL, POWERS, round, steer, step, WHISTLE_TURN } from '@/public/conga/sim.js';

// The same game every run.
function seeded(seed: number) {
  return () => { seed = seed + 0x6d2b79f5 | 0; let v = Math.imul(seed ^ seed >>> 15, 1 | seed); v = v + Math.imul(v ^ v >>> 7, 61 | v) ^ v; return ((v ^ v >>> 14) >>> 0) / 4294967296; };
}

// What a frame costs follows how many animals there are and how much of its path each line remembers. The ground always
// refills; what keeps a game drawable is that a line of 400 is full and picks nobody more up, and that a crowded ground
// pushes back (fewer new strays and riders, the bots shed) so one game can go on and on.
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
  const world = fresh();
  const most = { line: 0, inLines: 0, strays: 0, path: 0, aboard: 0, longFor: 0, overFor: 0 };
  let longFor = 0, overFor = 0;
  for (let n = 0; n < 30 * 60 * 15; n++) {
    const events = step(world, 1 / 30) as { type: string }[];
    let inLines = 0, top = 0;
    for (const line of world.lines as { tail: unknown[]; path: unknown[] }[]) { inLines += line.tail.length; top = Math.max(top, line.tail.length); most.path = Math.max(most.path, line.path.length); }
    most.line = Math.max(most.line, top);
    longFor = top > 400 ? longFor + 1 / 30 : 0; most.longFor = Math.max(most.longFor, longFor);
    most.inLines = Math.max(most.inLines, inLines); most.strays = Math.max(most.strays, world.strays.length); most.aboard = Math.max(most.aboard, world.shuttles[0].load);
    expect(events.some(event => event.type === 'full')).toBe(false); // the round never ends for being full
    overFor = inLines > FULL ? overFor + 1 / 30 : 0; most.overFor = Math.max(most.overFor, overFor);
  }
  expect(most.line).toBeGreaterThan(30); // the game did go on long enough for lines to grow
  // No line ever passes 400: a full one draws no strays, and a sack's animals go home.
  expect(most.longFor).toBe(0);
  // One game, never reset, stays drawable: past FULL now and then by a few, for a moment, when a big sack lands.
  expect(most.inLines).toBeLessThan(FULL + 60);
  expect(most.overFor).toBeLessThan(3);
  expect(most.strays).toBeLessThanOrEqual(420);
  expect(most.path).toBeLessThan(5300); // a line of 800, standing 33 apart on points 5 apart
  expect(most.aboard).toBeLessThanOrEqual(40); // a car has seats, so it cannot hand one line hundreds at once
}, 120_000);

// A crowded ground pushes back on the bots only: the player's line is never thinned for it.
it('thins the bots, never the player, once the ground is crowded', () => {
  const world = createWorld(seeded(5), round(), []);
  addLine(world, { id: 0, face: 1, name: 'You', start: 50 });
  // Twelve bots of 60, short enough that they never shed on their own: only the crowding can shrink them.
  for (let id = 1; id <= 12; id++) addLine(world, { id, face: 1, name: `Bot ${id}`, bot: { skill: 0.5, aggro: 0 } as never, start: 60 });
  const lines = world.lines as { tail: unknown[]; dead: number }[];
  let home = 0;
  for (let n = 0; n < 30 * 5; n++) home += (step(world, 1 / 30) as { type: string }[]).filter(event => event.type === 'home').length;
  expect(home).toBeGreaterThan(40); // the bots went home by the dozen
  expect(lines[0].dead).toBe(0);
  expect(lines[0].tail.length).toBeGreaterThanOrEqual(50); // and the player lost none
});

// As in slither.io, a line never shrinks on its own: not for picking nobody up, not for being long.
it('never shrinks a line on its own, however long it goes without picking anyone up, however long it is', () => {
  const world = createWorld(seeded(3), round(), []);
  world.strays.length = 0; world.feed = 0; // nothing to pick up
  (world as never as { shuttles: unknown[] }).shuttles.length = 0;
  const line = addLine(world, { id: 'me', face: 1, name: 'You', start: 200 }) as { a: number; tail: unknown[] };
  for (let n = 0; n < 60 * 30; n++) { steer(line as never, line.a + 1, false); step(world, 1 / 30); }
  expect(line.tail.length).toBe(200);
});

// A line of 400 is full: what a slow phone can draw. It draws no more strays, and they stay for someone else.
it('lets a full line pick nobody more up', () => {
  const world = createWorld(seeded(3), round(), []);
  world.strays.length = 0; world.feed = 0;
  const line = addLine(world, { id: 'me', face: 1, name: 'You', start: 400 }) as Line;
  (world.strays as unknown[]).push({ x: line.x + 10, y: line.y, face: 1, a: 0, vx: 0, vy: 0 });
  step(world, 1 / 30);
  expect(line.tail.length).toBe(400);
  expect(world.strays).toHaveLength(1);
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

// Some strays on the ground are big ones, worth BIG: the line gets that many.
it('turns up a big stray now and then, and gives a line all it is worth', () => {
  const world = createWorld(seeded(9), round(), []) as never as { strays: { worth?: number }[] };
  const big = world.strays.filter(s => s.worth === BIG).length;
  expect(big).toBeGreaterThan(0);
  expect(big).toBeLessThan(world.strays.length / 4);
  const { world: w, line } = alone();
  w.strays.push({ x: line.x + 10, y: line.y, face: 1, a: 0, vx: 0, vy: 0, worth: BIG } as never);
  for (let n = 0; n < 30; n++) step(w as never, 1 / 30);
  expect(line.tail.length).toBe(20 + BIG);
});

// Slither.io's trap: a bot being circled makes for the gap that is left, and dashes for it.
it('sends a bot being circled for the gap, dashing', () => {
  const circled = (ring: boolean) => {
    const world = createWorld(seeded(4), round(), []) as never as { strays: unknown[]; feed: number; items: unknown[]; lay: number; shuttles: unknown[] };
    world.strays.length = 0; world.feed = 0; world.items.length = 0; world.lay = 0; world.shuttles.length = 0;
    // Added first, so it thinks before the ring moves.
    const bot = addLine(world as never, { id: 'bot', face: 1, name: 'Bot', bot: { skill: 1, aggro: 0 } as never, start: 5 }) as Line & { want: number; dash: boolean };
    Object.assign(bot, { x: 0, y: 0, a: Math.PI, want: Math.PI });
    const big = addLine(world as never, { id: 'big', face: 2, name: 'Big', start: 28 }) as Line;
    // The big line stands round the bot from 45° to 315°, leaving a gap to the east (0°).
    (big.tail as { x: number; y: number }[]).forEach((f, i) => { const a = Math.PI / 4 + i * (Math.PI * 1.5) / 27; Object.assign(f, { x: Math.cos(a) * 200, y: Math.sin(a) * 200 }); });
    Object.assign(big, { x: Math.cos(Math.PI / 4) * 200, y: Math.sin(Math.PI / 4) * 200 - 40 });
    if (!ring) Object.assign(big, { x: 3000, y: 3000 }), (big.tail as { x: number; y: number }[]).forEach(f => Object.assign(f, { x: 3000, y: 3000 }));
    step(world as never, 1 / 30);
    return bot;
  };
  const trapped = circled(true);
  expect(Math.abs(Math.atan2(Math.sin(trapped.want), Math.cos(trapped.want)))).toBeLessThan(0.4); // east, through the gap
  expect(trapped.dash).toBe(true);
  expect(circled(false).dash).toBe(false);
});

it('lets a line turn sharper with the whistle', () => {
  const turned = (whistle: boolean) => {
    const { world, line } = alone();
    if (whistle) line.powers.whistle = POWERS.whistle;
    steer(line as never, Math.PI / 2, false);
    step(world, 1 / 10);
    return line.a;
  };
  expect(turned(true)).toBeCloseTo(turned(false) * WHISTLE_TURN, 5);
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

// The whistle is safe passage: a head that walks into another line slips through it instead of scattering.
it('lets a line with the whistle walk through another line without scattering', () => {
  const run = (whistle: boolean) => {
    const world = createWorld(seeded(9), round(), []) as never as { strays: unknown[]; feed: number; items: unknown[]; lay: number; mobs: unknown[] };
    world.strays.length = 0; world.feed = 0; world.items.length = 0; world.lay = 0;
    const me = addLine(world, { id: 'me', face: 1, name: 'You', start: 10 }) as Line & { safe: number; dead: number };
    const wall = addLine(world, { id: 'wall', face: 2, name: 'Risley', start: 20 }) as Line & { safe: number };
    // Your head heads east into the wall's back, which lies across your way.
    Object.assign(me, { x: 0, y: 0, a: 0, want: 0, safe: 0, path: [{ x: 0, y: 0 }, { x: -600, y: 0 }] });
    Object.assign(wall, { x: 10, y: 400, a: Math.PI / 2, want: Math.PI / 2, safe: 0, path: [{ x: 10, y: 400 }, { x: 10, y: -400 }] });
    (me.tail as { x: number; y: number }[]).forEach((f, i) => Object.assign(f, { x: -33 * (i + 1), y: 0 }));
    (wall.tail as { x: number; y: number }[]).forEach((f, i) => Object.assign(f, { x: 10, y: 400 - 33 * (i + 1) }));
    if (whistle) me.powers.whistle = POWERS.whistle;
    const events = step(world, 1 / 30) as { type: string; line?: string }[];
    return events.some(event => event.type === 'spill' && event.line === 'me') || !!me.dead;
  };
  expect(run(false)).toBe(true);
  expect(run(true)).toBe(false);
});

// A name painted into the ground is read from above, so no tree or building may stand on it.
it('keeps every name painted into the ground clear of trees and buildings', async () => {
  const { MAPS, ZONE_NAME, PLACE_NAME, treeWidth, TALL } = await import('@/public/conga/maps.js');
  const { AT } = await import('@/public/conga/scenery.js');
  type Box = number[];
  const box = (text: string, [x, y]: number[], size: number): Box => { const half = text.length * size * 0.32 + 8; return [x - half, y - size * 0.75, x + half, y + size * 0.75]; };
  const hit = (A: Box, B: Box) => A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3];
  for (const map of Object.values(MAPS) as { things: { kind: string; name: string; x: number; y: number; w: number; h: number; toy?: string; from?: unknown; label?: number[] }[]; zones: { name: string; at: number[] }[]; trees: { x: number; y: number; r: number; kind: string }[] }[]) {
    const names = [...map.zones.map(zone => box(zone.name, zone.at, ZONE_NAME)), ...map.things.filter(thing => !thing.from && !thing.toy).map(thing => box(thing.name, thing.label!, PLACE_NAME))];
    const trees = map.trees.map(({ x, y, r, kind }) => { const wide = treeWidth(r), [, , w, h] = AT[kind as keyof typeof AT], foot = y + r * 0.6; return [x - wide / 2, foot - wide * h / w, x + wide / 2, foot]; });
    const toys = map.things.filter(thing => thing.toy && ['hall', 'tower', 'water'].includes(thing.kind)).map(thing => {
      const [, , w, h] = AT[thing.toy as keyof typeof AT], wide = thing.kind === 'tower' ? thing.w * TALL : thing.w, foot = thing.kind === 'tower' ? thing.y + 12 : thing.y + thing.h / 2;
      return [thing.x - wide / 2, foot - wide * h / w, thing.x + wide / 2, foot];
    });
    for (const name of names) for (const over of [...trees, ...toys]) expect(hit(name, over)).toBe(false);
  }
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
