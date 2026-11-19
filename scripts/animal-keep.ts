// Opt-in, real spend: sets a picture picked on /demo/mockups-animals.html among the animals shipped with the app.
//   node --import tsx scripts/animal-keep.ts public/demo/animal-tests/0-picked/cornell-bear.png 38
// The picture is drawn once more on a transparent ground, then set in the set's frame as public/animals/38.png:
// 192px, the figure in the middle with room around it (as lib/campus/custom-face.ts frames a made animal).
import { generateImage } from 'ai';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

async function main() {
  const [picked, number] = process.argv.slice(2);
  if (!picked || !/^\d+$/.test(number ?? '')) throw new Error('Name the picture and its number: node --import tsx scripts/animal-keep.ts <picture.png> 38');
  try { process.loadEnvFile('.env.local'); } catch { /* the key can come from the shell */ }
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error('Set AI_GATEWAY_API_KEY in .env.local');
  const { image } = await generateImage({
    model: 'openai/gpt-image-2.6-flare', size: '1024x1024', maxRetries: 1, abortSignal: AbortSignal.timeout(180000),
    prompt: { images: [await sharp(picked).png().toBuffer()], text: 'Redraw this exact figure, changing nothing about it. Transparent background, no shadow.' },
    providerOptions: { openai: { background: 'transparent', output_format: 'png' } },
  });
  const figure = await sharp(image.uint8Array).trim().resize(168, 168, { fit: 'inside' }).png().toBuffer();
  const out = `public/animals/${number.padStart(2, '0')}.png`;
  writeFileSync(out, await sharp({ create: { width: 192, height: 192, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: figure, gravity: 'centre' }]).png().toBuffer());
  console.log(out);
}
void main().catch(error => { console.error(error instanceof Error ? error.message.slice(0, 300) : error); process.exitCode = 1; });
