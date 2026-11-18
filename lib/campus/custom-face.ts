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

/** How many pictures one person may have made: the one that is free while there is no payment. Each costs a few cents. */
export const MAKES = 1;
const ALL = 'You have made your free animal. Making more is not set up yet.';
/** Makes a made picture the person's face. Which one is kept on the face itself, so it may be one they did not make. */
const USE = 'insert into campus_face(person_id,face,picture) values($1,$2,$3) on conflict(person_id) do update set face=excluded.face,picture=excluded.picture,picked_at=now()';
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

export type CustomFace = { token: string | null; all: string[]; left: number; asked: boolean };
/**
 * For each person: the token of the made animal they use (their own, or one the admin offers to everyone), of every one
 * they made (oldest first), how many more they may make, and whether they asked to subscribe.
 */
export async function customFaces(q: Q, personIds: readonly string[]): Promise<Map<string, CustomFace>> {
  if (!personIds.length) return new Map();
  const { rows } = await q.query<{ id: string; token: string | null; every: string[]; makes: number | null }>(`select i.id,(select p.token::text from campus_custom_picture p where p.token=coalesce(c.picture,f.token)) as token,
    coalesce((select array_agg(p.token::text order by p.made_at) from campus_custom_picture p where p.person_id=i.id),'{}'::text[]) as every,f.makes
    from unnest($1::uuid[]) as i(id) left join campus_custom_face f on f.person_id=i.id left join campus_face c on c.person_id=i.id`, [personIds]);
  return new Map(rows.map(row => [row.id, { token: row.token, all: row.every, left: Math.max(0, MAKES - (row.makes ?? 0)), asked: row.makes !== null }]));
}

/**
 * "Subscribe" on a person's own animal. What they asked, and the email they gave, is kept; nothing is charged. Their
 * animal is drawn from the photo and becomes their face. Later pictures need no email again. `unlimited` is for the
 * admin, who tests this and is never stopped at the free one. Returns the picture's token.
 */
export async function makeCustomFace(db: Db, personId: string, upload: Uint8Array, email: string | null, draw: Draw = drawFace, unlimited = false): Promise<{ token: string; left: number }> {
  const { rows: [had] } = await db.query<{ makes: number }>('select makes from campus_custom_face where person_id=$1', [personId]);
  const given = (email ?? '').trim().toLowerCase();
  if (!had && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(given)) throw new CampusError('Enter the email to subscribe with.');
  if (had && had.makes >= MAKES && !unlimited) throw new CampusError(ALL);
  // The ask is kept even when the drawing fails: it is what the test counts.
  if (!had) await db.query('insert into campus_custom_face(person_id,email) values($1,$2) on conflict(person_id) do nothing', [personId, given.slice(0, 320)]);
  const image = await draw(upload);
  // Every picture is kept; the new one becomes the one in use.
  return db.tx(async q => {
    const { rows: [row] } = await q.query<{ token: string; makes: number }>('update campus_custom_face set token=gen_random_uuid(),makes=makes+1,made_at=now() where person_id=$1 and (makes<$2 or $3) returning token,makes', [personId, MAKES, unlimited]);
    if (!row) throw new CampusError(ALL);
    await q.query("insert into campus_custom_picture(token,person_id,image) values($1,$2,decode($3,'base64'))", [row.token, personId, Buffer.from(image).toString('base64')]);
    await q.query(USE, [personId, CUSTOM, row.token]);
    return { token: row.token, left: unlimited ? MAKES : Math.max(0, MAKES - row.makes) };
  });
}

/** "Subscribe" to Loop Premium. Nothing is charged: that they asked, and the email they gave, is kept. Asking twice changes nothing. */
export async function subscribe(q: Q, personId: string, email: string): Promise<void> {
  const given = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(given)) throw new CampusError('Enter the email to subscribe with.');
  await q.query('insert into campus_custom_face(person_id,email) values($1,$2) on conflict(person_id) do nothing', [personId, given.slice(0, 320)]);
}

export type PremiumAsk = { email: string; asked: string; pictures: { token: string; shared: boolean }[] };
/** For the admin: everyone who asked to subscribe, newest first, each with the animals they had made and whether each is offered to everyone. */
export async function premiumAsks(q: Q): Promise<PremiumAsk[]> {
  return (await q.query<PremiumAsk>(`select f.email,to_char(f.asked_at,'YYYY-MM-DD') as asked,
    coalesce((select json_agg(json_build_object('token',p.token,'shared',p.shared_at is not null) order by p.made_at) from campus_custom_picture p where p.person_id=f.person_id),'[]'::json) as pictures
    from campus_custom_face f order by f.asked_at desc limit 500`)).rows;
}

/** The made animals the admin offers to everyone, in the order they were offered: shown in every picker with the standard ones. */
export async function sharedFaces(q: Q): Promise<string[]> {
  return (await q.query<{ token: string }>('select token::text as token from campus_custom_picture where shared_at is not null order by shared_at,token')).rows.map(row => row.token);
}
/** The admin offers a made animal to everyone, or stops. Whoever already uses it keeps it. */
export async function sharePicture(q: Q, token: string, on: boolean): Promise<void> {
  if (!z.uuid().safeParse(token).success || !(await q.query('update campus_custom_picture set shared_at=case when $2 then coalesce(shared_at,now()) end where token=$1 returning 1', [token, on])).rows.length) throw new Error('No such picture');
}
/** The admin deletes a made animal for good. Everyone who used it is shown their own animal again; its maker does not get another free one. */
export async function deletePicture(q: Q, token: string): Promise<void> {
  if (!z.uuid().safeParse(token).success || !(await q.query('delete from campus_custom_picture where token=$1 returning 1', [token])).rows.length) throw new Error('No such picture');
}

/** A person picks a made animal as their face: one of their own, or one the admin offers to everyone. */
export async function useCustomFace(q: Q, personId: string, token: string): Promise<void> {
  const theirs = z.uuid().safeParse(token).success && (await q.query('select 1 from campus_custom_picture where token=$2 and (person_id=$1 or shared_at is not null)', [personId, token])).rows.length;
  if (!theirs) throw new CampusError('Pick one of the animals.');
  await q.query(USE, [personId, CUSTOM, token]);
}

/** The picture behind a token, for /animals/custom/<token>. */
export async function customFaceImage(q: Q, token: string): Promise<Uint8Array | null> {
  if (!z.uuid().safeParse(token).success) return null;
  // As text both ways: the two database drivers (live and test) do not agree on how bytes are handed over.
  const { rows: [row] } = await q.query<{ image: string | null }>("select encode(image,'base64') as image from campus_custom_picture where token=$1", [token]);
  return row?.image ? Buffer.from(row.image, 'base64') : null;
}
