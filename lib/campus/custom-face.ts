import 'server-only';
import { generateImage, generateText } from 'ai';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { CHANGES, CUSTOM, NAMES } from './animals';
import { recordAsk, type AskPlace } from './ink';
import { NEEDS_PREMIUM } from './animal-tiers';
import { hasInk } from './ink';
import { CampusError } from './errors';

// A person's own animal: a photo of an animal, drawn as a figure of the set in public/animals. Premium, with no payment
// yet: asking to subscribe is recorded, and the picture is made free.

/** How many pictures one person may have made: the one that is free while there is no payment. Each costs a few cents. */
export const MAKES = 1;
const ALL = 'You have made your free animal. Making more is not set up yet.';
/** Makes a made picture the person's face. Which one is kept on the face itself, so it may be one they did not make. */
const USE = 'insert into campus_face(person_id,face,picture) values($1,$2,$3) on conflict(person_id) do update set face=excluded.face,picture=excluded.picture,picked_at=now()';
const ONCE = 'That one is already being drawn again. Try in a minute.';
/** The short line each asked change adds to the drawing's words. */
const ASKS: Record<(typeof CHANGES)[number], string> = { Fluffier: 'Make the fur fluffier.', 'Bigger eyes': 'Make the eyes bigger.', 'Different pose': 'Put it in a different pose.', 'Truer colors': "Match the photo's colours more closely." };
const NOT_NOW = 'That could not be drawn just now. Try again in a minute.';

/** A drawn figure on a transparent ground, twice: the 192px PNG a face is, and the drawing kept large (up to 1024px) for saving it out of the app. */
export type Made = { small: Uint8Array; large: Uint8Array };
/** Draws the figure from an uploaded photo. Refuses a photo with no animal in it. */
export type Draw = (upload: Uint8Array, changes?: readonly (typeof CHANGES)[number][], note?: string) => Promise<Made>;
/** A person's own words for what should change, made safe to set in the drawing's words: one short line of plain letters. */
const plain = (note: string) => note.replace(/[^\p{L}\p{N} ,'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

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

/** Sets a drawn figure in the frame the set uses: 192px, the figure in the middle with room around it. The drawing itself is kept too, its empty edge cut away. */
async function frame(drawn: Uint8Array): Promise<Made> {
  const large = await sharp(drawn).trim().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const figure = await sharp(large).resize(168, 168, { fit: 'inside' }).png().toBuffer();
  return { large, small: await sharp({ create: { width: 192, height: 192, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: figure, gravity: 'centre' }]).png().toBuffer() };
}
/**
 * Keeps the large drawing beside a made animal. On its own, after the animal is kept, and never in its way: the column
 * is added by a migration run by hand (20261119500000), and until it is, an animal is made as before, with no large one.
 */
async function keepLarge(q: Q, token: string, large: Uint8Array): Promise<void> {
  try { await q.query("update campus_custom_picture set large=decode($2,'base64') where token=$1", [token, Buffer.from(large).toString('base64')]); }
  catch (error) { console.error('custom face: large drawing not kept', error instanceof Error ? error.name : 'unknown'); }
}

/** The real thing: one look at the photo, then one picture, modelled on the nearest of the set. About 20 seconds. */
export const drawFace: Draw = async (upload, changes = [], note = '') => {
  let photo: Buffer;
  try { photo = await sharp(upload).rotate().resize(1024, 1024, { fit: 'inside' }).flatten({ background: '#fff' }).png().toBuffer(); }
  catch { throw new CampusError('That file is not a photo Loopd can read. Try a JPEG or a PNG.'); }
  try {
    const { animal, nearest } = await look(photo);
    if (!animal) throw new CampusError('That does not look like an animal. Try a clear photo of one animal.');
    // One original and one short line: more of either made every model draw a plainer animal.
    const like = await sharp(path.join(process.cwd(), 'public', 'animals', `${String(nearest).padStart(2, '0')}.png`)).resize(512, 512).flatten({ background: '#fff' }).png().toBuffer();
    const { image } = await generateImage({
      model: 'openai/gpt-image-2.6-flare', size: '1024x1024', maxRetries: 1, abortSignal: AbortSignal.timeout(120000),
      prompt: { images: [like, photo], text: `Turn the animal in the second picture into a toy figure in exactly the style of the first picture. Keep the animal's own colours, markings${changes.includes('Different pose') ? ' and ears' : ', ears and pose'}. ${changes.map(one => `${ASKS[one]} `).join('')}${plain(note) && `The owner also asks: ${plain(note)}. `}Only the animal: leave out anything else in the photo. Transparent background, no shadow.` },
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
    coalesce((select array_agg(p.token::text order by p.made_at) from campus_custom_picture p where p.person_id=i.id and p.let_go_at is null),'{}'::text[]) as every,f.makes
    from unnest($1::uuid[]) as i(id) left join campus_custom_face f on f.person_id=i.id left join campus_face c on c.person_id=i.id`, [personIds]);
  return new Map(rows.map(row => [row.id, { token: row.token, all: row.every, left: Math.max(0, MAKES - (row.makes ?? 0)), asked: row.makes !== null }]));
}

/**
 * "Subscribe" on a person's own animal. What they asked, and the email they gave, is kept; nothing is charged. Their
 * animal is drawn from the photo and becomes their face. Later pictures need no email again. `unlimited` is for the
 * admin, who tests this and is never stopped at the free one. Returns the picture's token.
 */
export async function makeCustomFace(db: Db, personId: string, upload: Uint8Array, email: string | null, draw: Draw = drawFace, unlimited = false, /** A short line of the person's own for the drawing, as when it is drawn again. */ note = ''): Promise<{ token: string; left: number }> {
  const { rows: [had] } = await db.query<{ makes: number }>('select makes from campus_custom_face where person_id=$1', [personId]);
  const given = (email ?? '').trim().toLowerCase();
  if (!had && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(given)) throw new CampusError('Enter the email to subscribe with.');
  if (had && had.makes >= MAKES && !unlimited) throw new CampusError(ALL);
  // The ask is kept even when the drawing fails: it is what the test counts.
  if (!had) await db.query('insert into campus_custom_face(person_id,email) values($1,$2) on conflict(person_id) do nothing', [personId, given.slice(0, 320)]);
  const image = await draw(upload, [], note);
  // Every picture is kept; the new one becomes the one in use.
  const made = await db.tx(async q => {
    const { rows: [row] } = await q.query<{ token: string; makes: number }>('update campus_custom_face set token=gen_random_uuid(),makes=makes+1,made_at=now() where person_id=$1 and (makes<$2 or $3) returning token,makes', [personId, MAKES, unlimited]);
    if (!row) throw new CampusError(ALL);
    await q.query("insert into campus_custom_picture(token,person_id,image) values($1,$2,decode($3,'base64'))", [row.token, personId, Buffer.from(image.small).toString('base64')]);
    await q.query(USE, [personId, CUSTOM, row.token]);
    return { token: row.token, left: unlimited ? MAKES : Math.max(0, MAKES - row.makes) };
  });
  await keepLarge(db, made.token, image.large);
  return made;
}

/**
 * "Redraw your pet": a photo drawn again beside an animal the person already had made, with what they asked to be
 * different (the ready-made changes, and a short line of their own). It does not count as another animal made. The
 * new drawing starts let go, so it is nobody's picture until it is kept (keepPicture). Who may do this is the
 * caller's to check: it takes the founder's code. Returns the new one's token.
 */
export async function retryCustomFace(db: Db, personId: string, upload: Uint8Array, first: string, changes: readonly string[], note = '', draw: Draw = drawFace): Promise<string> {
  const { rows: [row] } = z.uuid().safeParse(first).success ? await db.query('select 1 from campus_custom_picture p where p.token=$2 and p.person_id=$1 and p.let_go_at is null', [personId, first]) : { rows: [] };
  if (!row) throw new CampusError('Pick one of the animals.');
  const image = await draw(upload, CHANGES.filter(one => changes.includes(one)), note);
  // A pair is the kept one and its newest drawing: earlier pairs of this one are untied first. The unique index holds it to one when two are asked for at once.
  const made = await db.tx(async q => {
    await q.query('update campus_custom_picture set retry_of=null where person_id=$1 and (token=$2 or retry_of=$2)', [personId, first]);
    return (await q.query<{ token: string }>("insert into campus_custom_picture(person_id,image,retry_of,let_go_at) values($1,decode($2,'base64'),$3,now()) on conflict do nothing returning token::text as token", [personId, Buffer.from(image.small).toString('base64'), first])).rows[0];
  });
  if (!made) throw new CampusError(ONCE);
  await keepLarge(db, made.token, image.large);
  return made.token;
}

/** Of an animal and its redrawing, the person keeps one: it is their face, and the other is let go. The admin still sees both. */
export async function keepPicture(db: Db, personId: string, keep: string): Promise<void> {
  if (!z.uuid().safeParse(keep).success) throw new CampusError('Pick one of the animals.');
  await db.tx(async q => {
    const { rows: [row] } = await q.query<{ other: string | null }>('select coalesce(p.retry_of,(select r.token from campus_custom_picture r where r.retry_of=p.token))::text as other from campus_custom_picture p where p.token=$2 and p.person_id=$1', [personId, keep]);
    if (!row?.other) throw new CampusError('Pick one of the animals.');
    await q.query('update campus_custom_picture set let_go_at=case when token=$2 then null else now() end where person_id=$1 and token in ($2,$3)', [personId, keep, row.other]);
    await q.query(USE, [personId, CUSTOM, keep]);
  });
}

/** "Subscribe" to Loopd Premium. Nothing is charged: that they asked, and the email they gave, is kept. Asking twice changes nothing. */
export async function subscribe(q: Q, personId: string, email: string, place: AskPlace = 'own animal'): Promise<void> {
  const given = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(given)) throw new CampusError('Enter the email to subscribe with.');
  await q.query('insert into campus_custom_face(person_id,email) values($1,$2) on conflict(person_id) do nothing', [personId, given.slice(0, 320)]);
  // Every press is kept, with where it was made (lib/campus/ink.ts).
  await recordAsk(q, personId, given.slice(0, 320), 'ink', place);
}

export type PremiumAsk = { email: string; asked: string; pictures: string[] };
/** For the admin: everyone who asked to subscribe, newest first, each with the tokens of the animals they had made. */
export async function premiumAsks(q: Q): Promise<PremiumAsk[]> {
  return (await q.query<PremiumAsk>(`select f.email,to_char(f.asked_at,'YYYY-MM-DD') as asked,
    coalesce((select array_agg(p.token::text order by p.made_at) from campus_custom_picture p where p.person_id=f.person_id),'{}'::text[]) as pictures
    from campus_custom_face f order by f.asked_at desc limit 500`)).rows;
}
/** The admin deletes a made animal for good. Everyone who used it is shown their own animal again; its maker does not get another free one. */
export async function deletePicture(q: Q, token: string): Promise<void> {
  if (!z.uuid().safeParse(token).success || !(await q.query('delete from campus_custom_picture where token=$1 returning 1', [token])).rows.length) throw new Error('No such picture');
}

/** The founder's code for making another animal once the free one is used. Checked here, on the server, and nowhere in the page. */
export const freeCode = (code: unknown) => typeof code === 'string' && code.trim().toUpperCase() === 'CHEAPSKATES';

/** A person picks a made animal as their face: one of their own, a core one, or a premium one when they subscribed (`premium` is also true for the admin). */
export async function useCustomFace(q: Q, personId: string, token: string, premium = false): Promise<void> {
  const { rows: [row] } = z.uuid().safeParse(token).success ? await q.query<{ mine: boolean; tier: string | null }>('select (person_id=$1 and let_go_at is null) as mine,tier from campus_custom_picture where token=$2', [personId, token]) : { rows: [] };
  if (!row || !(row.mine || row.tier)) throw new CampusError('Pick one of the animals.');
  if (!row.mine && row.tier === 'premium' && !premium && !(await hasInk(q, personId))) throw new CampusError(NEEDS_PREMIUM);
  await q.query(USE, [personId, CUSTOM, token]);
}

/** The picture behind a token, for /animals/custom/<token>. */
export async function customFaceImage(q: Q, token: string): Promise<Uint8Array | null> {
  if (!z.uuid().safeParse(token).success) return null;
  // As text both ways: the two database drivers (live and test) do not agree on how bytes are handed over.
  const { rows: [row] } = await q.query<{ image: string | null }>("select encode(image,'base64') as image from campus_custom_picture where token=$1", [token]);
  return row?.image ? Buffer.from(row.image, 'base64') : null;
}
/** A made animal as large as Loopd has it, for saving it out of the app: the large drawing, or else the 192px picture. */
export async function customFaceLarge(q: Q, token: string): Promise<Uint8Array | null> {
  if (!z.uuid().safeParse(token).success) return null;
  // Before the migration that adds the column is run, there is only the small one.
  const large = await q.query<{ image: string | null }>("select encode(large,'base64') as image from campus_custom_picture where token=$1", [token]).then(({ rows }) => rows[0]?.image ?? null, () => null);
  return large ? Buffer.from(large, 'base64') : customFaceImage(q, token);
}
