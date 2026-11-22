import { readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { animal, animalPng, ANIMALS, PREMIUM } from '@/lib/campus/animals';
import { inkBlot, inkFlung } from '@/lib/campus/ink-blot';

// openspec/changes/loop-lighter-pages, D2: pages show each face as WebP; the PNG stays as the drawing it is made from.
const dir = path.join(process.cwd(), 'public/animals');
const pngs = readdirSync(dir).filter(name => /^\d+\.png$/.test(name)).sort();

it('gives every face of the set a .webp address, and its PNG for reading from disk', () => {
  expect(pngs).toHaveLength(ANIMALS + PREMIUM.length);
  expect(animal(0)).toBe('/animals/01.webp');
  expect(animal(36)).toBe('/animals/37.webp');
  expect(animalPng(36)).toBe('/animals/37.png');
});

it('leaves each member the Ink blot they had while their face was a PNG', () => {
  expect(inkBlot('Ben/animals/14.webp')).toEqual(inkBlot('Ben/animals/14.png'));
  expect(inkFlung('Ben/animals/14.webp')).toEqual(inkFlung('Ben/animals/14.png'));
  expect(inkBlot('Ben/animals/14.webp').dark).not.toBe(inkBlot('Ben/animals/15.webp').dark);
});

// Opacity-weighted difference per channel, out of 255: colour under a clear pixel never shows, so it does not count.
async function drift(png: string, webp: string) {
  const [a, b] = await Promise.all([png, webp].map(file => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return Infinity;
  let sum = 0;
  for (let p = 0; p < a.data.length; p += 4) for (let k = 0; k < 4; k++) {
    const x = k < 3 ? a.data[p + k] * a.data[p + 3] / 255 : a.data[p + 3], y = k < 3 ? b.data[p + k] * b.data[p + 3] / 255 : b.data[p + 3];
    sum += Math.abs(x - y);
  }
  return sum / a.data.length;
}

it('has a WebP made from each face\'s current drawing (after redrawing one, run node scripts/animals-webp.mjs)', async () => {
  const stale: string[] = [];
  for (const name of pngs) {
    const webp = path.join(dir, name.replace(/\.png$/, '.webp'));
    let off = Infinity;
    try { off = await drift(path.join(dir, name), webp); } catch { /* missing or unreadable */ }
    // Made by the script, each is under 2 of 255 on average; a different drawing is far more.
    if (!(off < 4)) stale.push(`${name} (${off === Infinity ? 'no WebP' : off.toFixed(1)})`);
  }
  expect(stale).toEqual([]);
}, 60000);
