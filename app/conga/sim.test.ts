// @vitest-environment node
import { expect, it } from 'vitest';
import { addLine, createWorld, round, step } from '@/public/conga/sim.js';

// The same game every run.
function seeded(seed: number) {
  return () => { seed = seed + 0x6d2b79f5 | 0; let v = Math.imul(seed ^ seed >>> 15, 1 | seed); v = v + Math.imul(v ^ v >>> 7, 61 | v) ^ v; return ((v ^ v >>> 14) >>> 0) / 4294967296; };
}

// What a frame costs follows how many animals there are and how much of its path each line remembers. The rules keep
// both from growing as a game goes on: the back of a long line wanders off, and strays over the cap are taken away.
// The limits here are what a browser was measured to carry (2026-11-20): with the processor slowed four times, the
// page kept 60 frames a second with 800 animals in lines and 250 strays, and fell to 30 with a single line of 400.
// A rule that lets a game past them needs measuring again before it ships.
it('keeps the lines, the strays and the remembered paths within what a slow phone can draw, through a long game', () => {
  const random = seeded(7);
  const world = createWorld(random, round(), [], [{ name: 'Bus', from: [-1400, 0], to: [0, 0], off: [40, 40], riders: 18, ride: 36, stay: 5, away: 5 }] as never);
  for (let id = 0; id < 12; id++) addLine(world, { id, face: 1, name: `Line ${id}`, bot: { skill: 0.35 + random() * 0.65, aggro: random() } as never, start: 3 + Math.floor(random() * 14) });
  const lines = world.lines as { tail: unknown[]; path: unknown[] }[];
  const most = { line: 0, inLines: 0, strays: 0, path: 0 };
  for (let n = 0; n < 30 * 60 * 15; n++) {
    step(world, 1 / 30);
    let inLines = 0;
    for (const line of lines) { inLines += line.tail.length; most.line = Math.max(most.line, line.tail.length); most.path = Math.max(most.path, line.path.length); }
    most.inLines = Math.max(most.inLines, inLines); most.strays = Math.max(most.strays, world.strays.length);
  }
  expect(most.line).toBeGreaterThan(30); // the game did go on long enough for lines to grow
  expect(most.line).toBeLessThan(400);
  expect(most.inLines).toBeLessThan(800);
  expect(most.strays).toBeLessThanOrEqual(420);
  expect(most.path).toBeLessThan(1200);
});
