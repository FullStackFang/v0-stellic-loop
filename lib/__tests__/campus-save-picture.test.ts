// @vitest-environment node
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { expect, it, vi } from 'vitest';
import { savedPicture } from '@/lib/campus/save-picture';
import { grounds, hex, SHAPES, type Shape } from '@/lib/campus/save-shapes';

vi.mock('server-only', () => ({}));

// Spec: openspec/changes/loop-save-picture/specs/save-picture ("Three shapes", "Ground colours").
const figure = readFileSync(path.join(process.cwd(), 'public/animals/37.png'));
const [school, ink, cream] = grounds('cornell');
const make = (shape: Shape, mark = true, ground = school) => savedPicture({ figure, shape, ground, ink, mark, name: 'Ana Lopez', sub: 'Cornell' });
/** The colour of one dot of a picture, as #rrggbb, and how solid it is. */
const dot = async (png: Buffer, x: number, y: number) => { const { data } = await sharp(png).ensureAlpha().extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true }); return { colour: `#${[0, 1, 2].map(at => data[at].toString(16).padStart(2, '0')).join('')}`, alpha: data[3] }; };
/** With PREVIEW_DIR set, the files are kept to be looked at. */
const keep = (name: string, png: Buffer) => { if (process.env.PREVIEW_DIR) { mkdirSync(process.env.PREVIEW_DIR, { recursive: true }); writeFileSync(path.join(process.env.PREVIEW_DIR, `${name}.png`), png); } };

it('offers five grounds, the school\'s own first, and never the same colour twice', () => {
  for (const kit of ['cornell', 'columbia', 'cuny', 'nyu', 'loop', 'nowhere']) {
    const all = grounds(kit);
    expect(all.map(each => each.key).slice(0, 3)).toEqual(['school', 'ink', 'cream']);
    expect(new Set(all.map(each => hex(each.bg))).size).toBe(5);
  }
  expect(hex([1, 0, 0])).toBe('#ffffff');
  expect(hex([0, 0, 0])).toBe('#000000');
});

it('makes each shape at its size, on the ground picked, and the sticker with no ground', async () => {
  for (const shape of ['profile', 'tall'] as const) {
    const png = await make(shape), seen = await sharp(png).metadata();
    keep(shape, png);
    expect([seen.width, seen.height]).toEqual([SHAPES[shape].w, SHAPES[shape].h]);
    expect(await dot(png, 4, 4)).toEqual({ colour: hex(school.bg), alpha: 255 });
  }
  const onCream = await make('profile', true, cream);
  keep('profile-cream', onCream);
  expect((await dot(onCream, 4, 4)).colour).toBe(hex(cream.bg));
  const cut = await make('sticker'), seen = await sharp(cut).metadata();
  keep('sticker', cut);
  expect([seen.width, seen.height]).toEqual([512, 512]);
  expect((await dot(cut, 2, 2)).alpha).toBe(0);
  // A white edge all round the figure: going in from the left along its middle, solid white comes first, and it is several dots wide.
  const row = (await sharp(cut).ensureAlpha().extract({ left: 0, top: 256, width: 256, height: 1 }).raw().toBuffer()), white = [...Array(256).keys()].filter(x => row[x * 4 + 3] === 255 && row[x * 4] === 255 && row[x * 4 + 1] === 255 && row[x * 4 + 2] === 255);
  expect(white.length).toBeGreaterThanOrEqual(5);
  expect(white[white.length - 1] - white[0]).toBe(white.length - 1);
  // The tag at the corner is the mark.
  expect((await dot(cut, 418, 366)).colour).toBe(hex(ink.bg));
});

it('leaves the mark off when asked, and sets the figure in the middle', async () => {
  const marked = await make('profile'), plain = await make('profile', false);
  keep('profile-no-mark', plain);
  keep('tall-ink-no-mark', await make('tall', false, ink));
  // Where the mark's word is, there is only ground.
  const band = async (png: Buffer) => sharp(await sharp(png).extract({ left: 380, top: 925, width: 320, height: 45 }).png().toBuffer()).stats();
  expect((await band(plain)).channels[0].stdev).toBeLessThan(1);
  expect((await band(marked)).channels[0].stdev).toBeGreaterThan(10);
  const bare = await make('sticker', false);
  keep('sticker-no-mark', bare);
  expect((await dot(bare, 418, 366)).alpha).toBe(0);
});
