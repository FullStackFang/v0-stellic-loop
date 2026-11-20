// For the mockup public/demo/mockups-group-pick.html only: a small local server that draws the picked animals
// together with the real image model (real spend, about 7 cents a press). Every drawing is saved as a file in
// public/demo/animal-tests/group/drawn, with a list of them (drawn.json): what was picked, the words, and which one is kept.
//   node --import tsx scripts/group-draw-server.ts
import { generateImage } from 'ai';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import sharp from 'sharp';

try { process.loadEnvFile('.env.local'); } catch { /* the key can come from the shell */ }
const FOLDER = 'public/demo/animal-tests/group/drawn', LIST = `${FOLDER}/drawn.json`;
type Drawn = { file: string; faces: string[]; note: string; at: string; kept: boolean };
mkdirSync(FOLDER, { recursive: true });
const list = (): Drawn[] => existsSync(LIST) ? JSON.parse(readFileSync(LIST, 'utf8')) : [];
const keepList = (all: Drawn[]) => writeFileSync(LIST, JSON.stringify(all, null, 1));

// The person's own words, made safe to set in the drawing's words, as for a person's own animal (lib/campus/custom-face.ts).
const plain = (note: string) => note.replace(/[^\p{L}\p{N} ,'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
// A pick is a shipped picture's number, or the token of a made animal, read from the live app.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const picture = async (pick: string) => /^\d+$/.test(pick) ? `public/animals/${pick.padStart(2, '0')}.png` : Buffer.from(await (await fetch(`https://v0-stellic-loop.vercel.app/animals/custom/${pick}`)).arrayBuffer());
const draw = async (faces: string[], note: string, name: string): Promise<string> => {
  const images = await Promise.all(faces.map(async face => sharp(await picture(face)).resize(512, 512).flatten({ background: '#fff' }).png().toBuffer()));
  const { image } = await generateImage({
    model: 'openai/gpt-image-2.6-flare', size: '1024x1024', maxRetries: 1, abortSignal: AbortSignal.timeout(180000),
    prompt: { images, text: `Draw the ${faces.length} toy figures in these pictures together in one picture, as a close huddle of friends: some in front, some behind, touching. Keep each one exactly as it is: its own colours, markings, face and style. ${note && `The group also asks: ${note}. `}Nothing else in the picture. Transparent background, no shadow.` },
    providerOptions: { openai: { background: 'transparent', output_format: 'png' } },
  });
  // Saved before anything else is done with it: a drawing that was paid for is never only in the page.
  writeFileSync(`${FOLDER}/${name}`, await sharp(image.uint8Array).trim().png().toBuffer());
  return name;
};
createServer(async (request, response) => {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('content-type', 'application/json');
  const url = new URL(request.url ?? '/', 'http://x'), asked = url.searchParams;
  if (url.pathname === '/list') { response.end(JSON.stringify(list())); return; }
  if (url.pathname === '/keep') { const all = list().map(one => ({ ...one, kept: one.file === asked.get('file') })); keepList(all); response.end(JSON.stringify(all)); return; }
  const note = plain(asked.get('note') ?? '');
  const faces = (asked.get('faces') ?? '').split(',').filter(pick => UUID.test(pick) || (/^\d{1,2}$/.test(pick) && +pick >= 1 && +pick <= 40));
  if (faces.length < 2 || faces.length > 6) { response.statusCode = 400; response.end('[]'); return; }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const made = await Promise.allSettled([draw(faces, note, `${stamp}-1.png`), draw(faces, note, `${stamp}-2.png`)]);
  for (const one of made) if (one.status === 'rejected') console.error('failed', one.reason instanceof Error ? one.reason.message.slice(0, 200) : one.reason);
  const fresh: Drawn[] = made.flatMap(one => one.status === 'fulfilled' ? [{ file: one.value, faces, note, at: new Date().toISOString(), kept: false }] : []);
  keepList([...list(), ...fresh]);
  response.end(JSON.stringify(fresh));
}).listen(3111, () => console.log('drawing on http://localhost:3111'));
