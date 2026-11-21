// Opt-in, real spend (about 3.5 cents a picture): draws Conga's pickups as toy figures in the style of the animals, the
// way a member's own pet is drawn (lib/campus/custom-face.ts): one original animal and one short line, on GPT Image Flare.
//   node --import tsx scripts/pickup-art.ts
// Pictures land in public/demo/pickup-art/: one of each pickup, as an object with no face.
import { generateImage } from 'ai';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const PICKUPS = {
  megaphone: 'a megaphone, red with a white band and a white bell',
  coffee: 'a takeaway coffee cup, white with a brown card sleeve and a white lid, a little steam rising',
  whistle: "a referee's whistle, sunny yellow, with a short red cord",
};
const STYLE = 6; // the pig: one of the cleanest of the set

async function main() {
  try { process.loadEnvFile('.env.local'); } catch { /* the key can come from the shell */ }
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error('Set AI_GATEWAY_API_KEY in .env.local');
  const like = await sharp(`public/animals/${String(STYLE).padStart(2, '0')}.png`).resize(512, 512).flatten({ background: '#fff' }).png().toBuffer();
  const folder = 'public/demo/pickup-art';
  mkdirSync(folder, { recursive: true });
  const asks = Object.entries(PICKUPS).map(([name, what]) => [name,
    `Make ${what} as a toy figure in exactly the style of this picture: the same soft matte clay, chubby rounded simple shapes, soft colours and soft light. An object only, with no face. Transparent background, no shadow.`]);
  await Promise.all(asks.map(async ([label, text]) => {
    try {
      const { images } = await generateImage({
        model: 'openai/gpt-image-2.6-flare', size: '1024x1024', n: 1, maxRetries: 1, abortSignal: AbortSignal.timeout(180000),
        prompt: { images: [like], text },
        providerOptions: { openai: { background: 'transparent', output_format: 'png' } },
      });
      // Trimmed to the figure and kept at 256px, plenty for a pickup drawn at about 50px.
      await Promise.all(images.map(async image => writeFileSync(`${folder}/${label}.png`,
        await sharp(image.uint8Array).trim().resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer())));
      console.log(`${label}: ${images.length}`);
    } catch (error) {
      console.error(`${label}: failed. ${error instanceof Error ? error.message.slice(0, 300) : 'Unknown error'}`);
    }
  }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
