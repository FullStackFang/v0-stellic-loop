// node scripts/animals-webp.mjs   Writes public/animals/NN.webp beside each NN.png, same size, transparent ground kept.
// Run it again whenever a face's PNG is redrawn: lib/campus/animals-webp.test.ts fails while a WebP is stale.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = path.join(process.cwd(), 'public/animals');
export const QUALITY = 85;
let before = 0, after = 0;
for (const name of fs.readdirSync(dir).filter((f) => /^\d+\.png$/.test(f)).sort()) {
  const png = path.join(dir, name), webp = png.replace(/\.png$/, '.webp');
  await sharp(png).webp({ quality: QUALITY, alphaQuality: 100, effort: 6 }).toFile(webp);
  before += fs.statSync(png).size;
  after += fs.statSync(webp).size;
}
console.log(`PNG ${Math.round(before / 1024)} kB -> WebP ${Math.round(after / 1024)} kB`);
