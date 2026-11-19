// Opt-in live test, real spend (a few cents a picture): asks the image model to draw several of the set's animals
// together as one group picture, and saves what comes back in public/demo/animal-tests/group.
//   node --import tsx scripts/group-test.ts 37,5,23,12
// GROUP_N is how many pictures each way of asking makes (default 2).
import { generateImage } from 'ai';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const MODEL = 'openai/gpt-image-2.6-flare';
// One short line, as for a person's own animal: longer words made every model draw plainer figures.
const ASK = (many: string) => `Draw ${many} together in one picture, as a close huddle of friends: some in front, some behind, touching. Keep each one exactly as it is: its own colours, markings, face and style. Nothing else in the picture. Transparent background, no shadow.`;

async function main() {
  const faces = (process.argv[2] ?? '37,5,23,12').split(',').map(Number);
  try { process.loadEnvFile('.env.local'); } catch { /* the key can come from the shell */ }
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error('Set AI_GATEWAY_API_KEY in .env.local');
  const n = Number(process.env.GROUP_N ?? 2), folder = 'public/demo/animal-tests/group';
  mkdirSync(folder, { recursive: true });
  const each = await Promise.all(faces.map(face => sharp(`public/animals/${String(face).padStart(2, '0')}.png`).resize(512, 512).flatten({ background: '#fff' }).png().toBuffer()));
  // The same figures on one sheet, side by side: one picture to read in place of several.
  const sheet = await sharp({ create: { width: 512 * faces.length, height: 512, channels: 3, background: '#fff' } }).composite(each.map((input, at) => ({ input, left: 512 * at, top: 0 }))).png().toBuffer();
  const ways: [string, Buffer[], string][] = [['each', each, ASK(`the ${faces.length} toy figures in these pictures`)], ['sheet', [sheet], ASK(`the ${faces.length} toy figures in this picture`)]];
  await Promise.all(ways.flatMap(([name, images, text]) => Array.from({ length: n }, async (_, at) => {
    try {
      const { image } = await generateImage({ model: MODEL, size: '1024x1024', maxRetries: 1, abortSignal: AbortSignal.timeout(180000), prompt: { images, text }, providerOptions: { openai: { background: 'transparent', output_format: 'png' } } });
      writeFileSync(`${folder}/${faces.join('-')}-${name}-${at + 1}.png`, await sharp(image.uint8Array).trim().png().toBuffer());
      console.log('made', name, at + 1);
    } catch (error) { console.error('failed', name, at + 1, error instanceof Error ? error.message.slice(0, 200) : error); }
  })));
}
void main();
