// Builds the sprite sheets the Conga game draws its animals from: every face in public/animals on one image, so a
// visit downloads one file in place of forty-two. Run it again whenever a face is added or changed, with a new
// version, and set the same version in public/demo/mockups-conga.html:
//   node scripts/conga-atlas.mjs 2
// Each cell holds the animal with its ground shadow already under it, so the game draws one image per animal.
import { readdirSync, statSync } from 'node:fs';
import sharp from 'sharp';

const version = process.argv[2] ?? '1', from = 'public/animals/', to = 'public/demo/conga/', COLS = 7;
const files = readdirSync(from).filter(name => /^\d+\.png$/.test(name)).sort();
for (const cell of [96, 192]) {
  const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${cell}"><ellipse cx="50%" cy="89%" rx="34%" ry="10%" fill="#2e1d18" fill-opacity=".16"/></svg>`);
  const cells = await Promise.all(files.map(async (name, i) => {
    const place = { left: (i % COLS) * cell, top: Math.floor(i / COLS) * cell };
    return [{ input: shadow, ...place }, { input: await sharp(from + name).resize(cell, cell, { kernel: 'lanczos3' }).png().toBuffer(), ...place }];
  }));
  const file = `${to}animals-${cell}.v${version}.webp`;
  await sharp({ create: { width: COLS * cell, height: Math.ceil(files.length / COLS) * cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(cells.flat()).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(file);
  console.log(file, statSync(file).size, 'bytes,', files.length, 'faces');
}
