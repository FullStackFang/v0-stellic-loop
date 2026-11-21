// Packs Conga's toy scenery (made by scripts/pickup-art.ts into public/demo/pickup-art/) onto one sheet for the game, and
// writes where each one is on it. One file to load, kept by the browser for good: bump the version when the art changes.
//   node scripts/conga-scenery.mjs
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const VERSION = 2;
// Buildings are drawn up to a couple of hundred units across, so they are kept bigger than the small things.
const BIG = ['stonehall', 'chapel', 'glasshall', 'brickhall', 'armory', 'rink', 'dome', 'museum', 'castle', 'dorm', 'cafe', 'bloomberg', 'tata', 'tower', 'station', 'subway', 'ruin', 'farmhouse', 'stonechapel', 'octagon', 'clocktower', 'lighthouse', 'pond'];
const SMALL = ['tree', 'blossom', 'ferry', 'tug', 'cab', 'bus', 'tram', 'sack'];
const WIDE = 2048, GAP = 2;

const pieces = await Promise.all([...BIG.map(name => [name, 240]), ...SMALL.map(name => [name, 128])].map(async ([name, most]) => {
  const { data, info } = await sharp(`public/demo/pickup-art/${name}.png`).resize(most, most, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  return { name, data, w: info.width, h: info.height };
}));
// Shelves, tallest first.
pieces.sort((a, b) => b.h - a.h);
let x = 0, y = 0, shelf = 0;
const at = {};
for (const piece of pieces) {
  if (x + piece.w > WIDE) { x = 0; y += shelf + GAP; shelf = 0; }
  at[piece.name] = [x, y, piece.w, piece.h]; piece.x = x; piece.y = y;
  x += piece.w + GAP; shelf = Math.max(shelf, piece.h);
}
const tall = y + shelf;
const info = await sharp({ create: { width: WIDE, height: tall, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(pieces.map(piece => ({ input: piece.data, left: piece.x, top: piece.y })))
  .webp({ quality: 74, alphaQuality: 80, effort: 6 }).toFile(`public/conga/scenery.v${VERSION}.webp`);
writeFileSync('public/conga/scenery.js', `// Written by scripts/conga-scenery.mjs: where each toy is on public/conga/scenery.v${VERSION}.webp, as [x, y, width, height].\nexport const SHEET = './conga/scenery.v${VERSION}.webp';\nexport const AT = ${JSON.stringify(at)};\n`);
console.log(`${WIDE}x${tall}, ${info.size} bytes`);
