import 'server-only';
import { generateImage, generateText } from 'ai';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { CUSTOM, NAMES } from './animals';
import { CampusError } from './errors';

// A person's own animal: a photo of an animal, drawn as a figure of the set in public/animals. Premium, with no payment
// yet: asking to subscribe is recorded, and the picture is made free.

/** How many pictures one person may have made. Each costs a few cents. */
export const MAKES = 3;
const NOT_NOW = 'That could not be drawn just now. Try again in a minute.';

/** Draws the figure from an uploaded photo: a 192px PNG on a transparent ground. Refuses a photo with no animal in it. */
export type Draw = (upload: Uint8Array) => Promise<Uint8Array>;

const seen = z.object({ animal: z.boolean(), nearest: z.number().int().min(1).max(NAMES.length) });
/** Whether the photo shows an animal, and which of the set's it is nearest to. */
async function look(photo: Buffer): Promise<z.infer<typeof seen>> {
  const { text } = await generateText({
    model: 'anthropic/claude-sonnet-5.5', maxRetries: 1, abortSignal: AbortSignal.timeout(30000),
    messages: [{ role: 'user', content: [
      { type: 'text', text: `Someone uploaded this photo to have their animal drawn as a toy figure. The figures it can be modelled on are: ${NAMES.map((name, at) => `${at + 1} ${name}`).join(', ')}.
Answer in JSON only, with no other words: {"animal": true or false, "nearest": number}. "animal" is true only when the main subject is a real animal or a pet, and false for a person, an object, a drawing of a person, or no clear subject. "nearest" is the number of the figure whose body and face are closest to it.` },
      { type: 'file', mediaType: 'image/png', data: photo },
    ] }],
  });
  return seen.parse(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
}

/** Sets a drawn figure in the frame the set uses: 192px, the figure in the middle with room around it. */
async function frame(drawn: Uint8Array): Promise<Buffer> {
  const figure = await sharp(drawn).trim().resize(168, 168, { fit: 'inside' }).png().toBuffer();
  return sharp({ create: { width: 192, height: 192, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: figure, gravity: 'centre' }]).png().toBuffer();
}

/** The real thing: one look at the photo, then one picture, modelled on the nearest of the set. About 20 seconds. */
export const drawFace: Draw = async upload => {
  let photo: Buffer;
  try { photo = await sharp(upload).rotate().resize(1024, 1024, { fit: 'inside' }).flatten({ background: '#fff' }).png().toBuffer(); }
  catch { throw new CampusError('That file is not a photo Loop can read. Try a JPEG or a PNG.'); }
  try {
    const { animal, nearest } = await look(photo);
    if (!animal) throw new CampusError('That does not look like an animal. Try a clear photo of one animal.');
    // One original and one short line: more of either made every model draw a plainer animal.
    const like = await sharp(path.join(process.cwd(), 'public', 'animals', `${String(nearest).padStart(2, '0')}.png`)).resize(512, 512).flatten({ background: '#fff' }).png().toBuffer();
    const { image } = await generateImage({
      model: 'openai/gpt-image-2.6-flare', size: '1024x1024', maxRetries: 1, abortSignal: AbortSignal.timeout(120000),
      prompt: { images: [like, photo], text: "Turn the animal in the second picture into a toy figure in exactly the style of the first picture. Keep the animal's own colours, markings, ears and pose. Only the animal: leave out anything else in the photo. Transparent background, no shadow." },
      providerOptions: { openai: { background: 'transparent', output_format: 'png' } },
    });
    return await frame(image.uint8Array);
  } catch (error) {
    if (error instanceof CampusError) throw error;
    // A provider's error can carry the request; only that it failed is kept.
    console.error('custom face: drawing failed', error instanceof Error ? error.name : 'unknown');
    throw new CampusError(NOT_NOW);
  }
};

export type CustomFace = { token: string | null; left: number };
/** Each person's made animal, where they asked for one: its token once there is a picture, and how many more they may make. */
export async function customFaces(q: Q, personIds: readonly string[]): Promise<Map<string, CustomFace>> {
  if (!personIds.length) return new Map();
  const { rows } = await q.query<{ id: string; token: string | null; makes: number }>('select person_id as id,case when image is not null then token end as token,makes from campus_custom_face where person_id=any($1::uuid[])', [personIds]);
  return new Map(rows.map(row => [row.id, { token: row.token, left: Math.max(0, MAKES - row.makes) }]));
}

/**
 * "Subscribe" on a person's own animal. What they asked, and the email they gave, is kept; nothing is charged. Their
 * animal is drawn from the photo and becomes their face. Later pictures need no email again. Returns the picture's token.
 */
export async function makeCustomFace(db: Db, personId: string, upload: Uint8Array, email: string | null, draw: Draw = drawFace): Promise<CustomFace & { token: string }> {
  const { rows: [had] } = await db.query<{ makes: number }>('select makes from campus_custom_face where person_id=$1', [personId]);
  const given = (email ?? '').trim().toLowerCase();
  if (!had && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(given)) throw new CampusError('Enter the email to subscribe with.');
  if (had && had.makes >= MAKES) throw new CampusError(`You have made ${MAKES} animals, which is all for now.`);
  // The ask is kept even when the drawing fails: it is what the test counts.
  if (!had) await db.query('insert into campus_custom_face(person_id,email) values($1,$2) on conflict(person_id) do nothing', [personId, given.slice(0, 320)]);
  const image = await draw(upload);
  const { rows: [row] } = await db.query<{ token: string; makes: number }>(`update campus_custom_face set image=decode($2,'base64'),token=gen_random_uuid(),makes=makes+1,made_at=now() where person_id=$1 and makes<$3 returning token,makes`, [personId, Buffer.from(image).toString('base64'), MAKES]);
  if (!row) throw new CampusError(`You have made ${MAKES} animals, which is all for now.`);
  await db.query('insert into campus_face(person_id,face) values($1,$2) on conflict(person_id) do update set face=excluded.face,picked_at=now()', [personId, CUSTOM]);
  return { token: row.token, left: Math.max(0, MAKES - row.makes) };
}

/** The picture behind a token, for /animals/custom/<token>. */
export async function customFaceImage(q: Q, token: string): Promise<Uint8Array | null> {
  if (!z.uuid().safeParse(token).success) return null;
  // As text both ways: the two database drivers (live and test) do not agree on how bytes are handed over.
  const { rows: [row] } = await q.query<{ image: string | null }>("select encode(image,'base64') as image from campus_custom_face where token=$1", [token]);
  return row?.image ? Buffer.from(row.image, 'base64') : null;
}
