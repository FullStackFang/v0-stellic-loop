import { readFileSync, readdirSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

// The Conga game draws every animal from one sheet (scripts/conga-atlas.mjs). An animal added to public/animals is
// on no sheet until the sheet is built again, and the game then draws nothing where it should be.
const page = readFileSync('public/conga/index.html', 'utf8');
const animals = readdirSync('public/animals').filter(name => /^\d+\.png$/.test(name)).length;
const version = page.match(/animals-' \+ congaCell \+ '\.v(\d+)\.webp/)?.[1];
const [, cols, rows] = page.match(/const COLS = (\d+), ROWS = (\d+)/) ?? [];

describe('the Conga animal sheet', () => {
  it('holds every animal in public/animals', () => {
    expect(Number(cols) * Number(rows)).toBeGreaterThanOrEqual(animals);
  });

  it.each([96, 192])('is built at %ipx, as the page says, for every animal', async cell => {
    const { width, height } = await sharp(`public/conga/animals-${cell}.v${version}.webp`).metadata();
    expect([width, height]).toEqual([Number(cols) * cell, Number(rows) * cell]);
    expect(Math.ceil(animals / Number(cols))).toBe(Number(rows));
  });

  it('is asked for by the game and its fallback at the same version', () => {
    expect(page).toContain(`animals-\${SHEET}.v${version}.webp`);
    expect(page).toContain('700% ' + `${Number(rows)}00%`);
  });
});
