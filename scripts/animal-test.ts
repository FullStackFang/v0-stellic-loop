// Opt-in live test, real spend: asks several image models for one new animal in the style of public/animals,
// and lays what comes back beside the originals on /demo/mockups-animals.html.
//   node --import tsx scripts/animal-test.ts dachshund "long low body, short legs, long floppy ears, long snout"
// ANIMAL_MODELS (comma separated) and ANIMAL_N change which models are asked and for how many pictures each.
import { generateImage, generateText } from 'ai';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

// The originals sent as the style to match: pig, koala, panda, hamster, sheep, penguin. None is close to a dog or a
// cat: with the shiba and the fox in, a model gave the dachshund their pointed ears.
// ANIMAL_REFS names other originals, such as the single one a person would hand over with their photo.
const REFERENCES = process.env.ANIMAL_REFS?.split(',').map(Number) ?? [6, 13, 15, 32, 14, 12];
// Models listed as `language` by the gateway hand pictures back as files of a text answer.
const MODELS: Record<string, 'image' | 'language'> = {
  // One to three cents a picture: asked first, when ANIMAL_MODELS names none. (Recraft takes no attached pictures.)
  'bytedance/seedream-5.5': 'image',
  'bfl/flux-3-image-klein': 'image',
  'meta/muse-image-1.0': 'image',
  'spacexai/grok-imagine-image': 'image',
  // Three to nine cents and up: ANIMAL_TIER=best.
  'openai/gpt-image-2.6-sunburst': 'image',
  'google/gemini-nano-banana-2.1': 'language',
  'bfl/flux-3-image': 'image',
  'bytedance/seedream-5.0-pro': 'image',
};

// The most attached pictures a model takes, where that is fewer than the test sends.
const MOST: Record<string, number> = { 'spacexai/grok-imagine-image': 5 };

export const animalPrompt = (animal: string, traits: string, photo = false, set = REFERENCES.length) => `${photo
  ? `The first ${set} attached pictures are figures from one set. The last attached picture is a photo of a real ${animal}. Make that one ${animal} as a new figure for the set.`
  : `The attached pictures are figures from one set. Make one new figure for the same set: a ${animal}.`}

Match the set exactly. A small collectible toy figure with a chubby, rounded, simplified body. A smooth matte soft-clay surface, with no fur texture and no fine detail. A soft pastel version of the animal's ${photo ? 'own' : 'natural'} colours. Tiny black dot eyes set wide apart, pink blush cheeks, a small simple smile. Short stubby rounded limbs. The whole body is shown, sitting or standing, facing the viewer or turned slightly. Soft even studio light from above, with a faint soft shadow under the figure.

${photo
  ? `Its owner should know it at a glance. Take from the photo its coat colour, its markings and where they sit, the shape and set of its ears, its nose colour and its pose${traits ? `: ${traits}` : ''}. Take nothing else from the photo: not its realism, its fur, its lighting, its outline or its background. Its proportions come from the set, not from the photo: a big round head about as large as the body, an egg-shaped body, legs as short smooth nubs with no toes or claws. Its colours are lighter and milkier than in the photo, as pale as the set's.`
  : `Keep what makes it a ${animal} at a glance${traits ? `: ${traits}` : ''}.`} Simplify those features to fit the set's round proportions.

One figure only, centred, filling about 70% of a square frame, on a plain pure white background. No text, no props, no border, no floor line, no other animals. Do not copy any of the set's animals.`;

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  const [animal, traits = '', photo] = process.argv.slice(2);
  if (!animal) throw new Error('Name the animal: node --import tsx scripts/animal-test.ts dachshund "long low body, short legs" [photo]');
  try { process.loadEnvFile('.env.local'); } catch { /* the key can come from the shell */ }
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error('Set AI_GATEWAY_API_KEY in .env.local');

  const n = Number(process.env.ANIMAL_N ?? 4);
  const models = process.env.ANIMAL_MODELS?.split(',').map(model => model.trim()).filter(Boolean) ?? (process.env.ANIMAL_TIER === 'best' ? Object.keys(MODELS).slice(4) : Object.keys(MODELS).slice(0, 4));
  // The originals are 192px; Flux takes nothing under 256px, so they are sent at 512px on white.
  const all = await Promise.all(REFERENCES.map(number => sharp(`public/animals/${String(number).padStart(2, '0')}.png`).resize(512, 512).flatten({ background: '#fff' }).png().toBuffer()));
  const folder = `public/demo/animal-tests/${slug(animal)}`;
  mkdirSync(folder, { recursive: true });
  // The photo goes last, as a PNG on white: every model reads that, and the page shows it as the target.
  const subject = photo ? await sharp(photo).resize(1024, 1024, { fit: 'contain', background: '#fff' }).flatten({ background: '#fff' }).png().toBuffer() : null;
  if (subject) writeFileSync(`${folder}/0-photo.png`, subject);

  await Promise.all(models.map(async model => {
    try {
      const set = all.slice(0, (MOST[model] ?? Infinity) - (subject ? 1 : 0)), references = subject ? [...set, subject] : set;
      // ANIMAL_PROMPT replaces the long prompt with a line of one's own, as typed into a chat.
      const text = process.env.ANIMAL_PROMPT ?? animalPrompt(animal, traits, !!subject, set.length);
      let pictures: Uint8Array[];
      if (MODELS[model] === 'language') {
        const answers = await Promise.all(Array.from({ length: n }, () => generateText({
          model, maxRetries: 1, abortSignal: AbortSignal.timeout(180000),
          messages: [{ role: 'user', content: [{ type: 'text', text }, ...references.map(data => ({ type: 'file' as const, mediaType: 'image/png', data }))] }],
        })));
        pictures = answers.flatMap(answer => answer.files.filter(file => file.mediaType.startsWith('image/')).map(file => file.uint8Array));
      } else {
        const { images } = await generateImage({ model, prompt: { text, images: references }, n, maxImagesPerCall: 1, size: '1024x1024', maxRetries: 1, abortSignal: AbortSignal.timeout(480000) });
        pictures = images.map(image => image.uint8Array);
      }
      pictures.forEach((picture, index) => writeFileSync(`${folder}/${slug(model)}${process.env.ANIMAL_LABEL ? `-${slug(process.env.ANIMAL_LABEL)}` : ''}-${index + 1}.png`, picture));
      console.log(`${model}: ${pictures.length} pictures`);
    } catch (error) {
      // The message only: SDK errors can carry request bodies and headers.
      console.error(`${model}: failed. ${error instanceof Error ? error.message.slice(0, 300) : 'Unknown error'}`);
    }
  }));

  // The page shows every animal tested so far, each model's pictures in a row under the originals.
  const root = 'public/demo/animal-tests';
  const sections = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
    const files = readdirSync(`${root}/${entry.name}`).filter(file => file.endsWith('.png')).sort();
    const by = new Map<string, string[]>();
    for (const file of files) { if (file === '0-photo.png') continue; const model = file.replace(/-\d+\.png$/, ''); by.set(model, [...(by.get(model) ?? []), file]); }
    return `<h2>${entry.name}</h2>${files.includes('0-photo.png') ? `<h3>The photo to recreate</h3><div class="row"><img src="animal-tests/${entry.name}/0-photo.png" alt=""></div>` : ''}${[...by].map(([model, list]) => `<h3>${model}</h3><div class="row">${list.map(file => `<figure><img src="animal-tests/${entry.name}/${file}" alt=""><figcaption>${file.replace('.png', '')}</figcaption></figure>`).join('')}</div>`).join('')}`;
  });
  writeFileSync('public/demo/mockups-animals.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Custom animals: model test</title>
<style>body{font:15px/1.4 system-ui,sans-serif;margin:24px;background:#fff;color:#1a1a1a}h1{font-size:22px}h2{margin-top:40px;text-transform:capitalize}h3{font-size:14px;margin:20px 0 8px;color:#555}
.row{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;text-align:center}img{width:192px;height:192px;object-fit:contain;border:1px solid #eee;border-radius:12px;background:#fff}.small img{width:96px;height:96px}figcaption{font-size:11px;color:#888}</style>
<h1>Custom animals: which model holds the style?</h1><p>Top row: originals from the set. Below: what each model made from the same prompt and the same six originals.</p>
<h3>Originals</h3><div class="row small">${Array.from({ length: 36 }, (_, index) => `<img src="/animals/${String(index + 1).padStart(2, '0')}.png" alt="">`).join('')}</div>
${sections.join('')}</html>`);
  console.log('Open /demo/mockups-animals.html');
}
void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
