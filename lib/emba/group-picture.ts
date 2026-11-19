import 'server-only';
import { generateImage } from 'ai';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { isAdmin } from '../campus/admin';
import { picks as offered, schoolOfPerson } from '../campus/animal-tiers';
import { customFace } from '../campus/animals';
import { CampusError } from '../campus/errors';
import { hasInk, hasInkPlus } from '../campus/ink';
import { canAccessLoop, type Principal } from './access';
import { EmbaError } from './errors';

// A group's own picture (openspec loop-group-picture): whoever runs a group picks a few animals, the image model
// draws them together twice, and the person keeps one. This file is the mechanism alone: no page calls it yet.

/** How few and how many animals a group picture takes. The live test drew four; past six a tile-sized picture is unreadable. */
export const FEWEST = 2, MOST = 6;
/** How many times a person may ask while nothing is charged. Each ask costs two pictures. The admin has no limit. */
export const ASKS = 3;
/** How many drawings one ask makes. */
const DRAWINGS = 2;
const HOW_MANY = `Pick ${FEWEST} to ${MOST} animals.`;
const NOT_THAT = 'Pick from your own animals.';
export const NEEDS_INK_PLUS = 'Drawing a group together comes with Loop Ink+.';
const ALL_ASKED = `You have had a group drawn ${ASKS} times. Drawing more is not set up yet.`;
const NOT_NOW = 'That could not be drawn just now. Try again in a minute.';

/** One animal for the picture: a picture shipped with the app, by its number, or a made animal, by its token. */
export type Pick = { face: number } | { token: string };
const pickSchema = z.union([z.strictObject({ face: z.number().int().min(0).max(999) }), z.strictObject({ token: z.uuid() })]);
const scopeSchema = z.object({ orgId: z.uuid(), loopId: z.uuid() });
type Scope = z.infer<typeof scopeSchema>;
const key = (pick: Pick) => 'face' in pick ? `f${pick.face}` : `t${pick.token}`;

/** Draws the given animals together as one picture: a PNG on a transparent ground. Each animal comes as its own 512px PNG on white. */
export type DrawGroup = (animals: Uint8Array[], note?: string) => Promise<Uint8Array>;
/** A person's own words for what should change, made safe to set in the drawing's words: one short line of plain letters, as for a person's own animal. */
export const plainNote = (note: string) => note.replace(/[^\p{L}\p{N} ,'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

/** The real thing. One short line, as for a person's own animal: longer words made the model draw plainer figures. About half a minute. */
export const drawTogether: DrawGroup = async (animals, note = '') => {
  const { image } = await generateImage({
    model: 'openai/gpt-image-2.6-flare', size: '1024x1024', maxRetries: 1, abortSignal: AbortSignal.timeout(180000),
    prompt: { images: animals.map(each => Buffer.from(each)), text: `Draw the ${animals.length} toy figures in these pictures together in one picture, as a close huddle of friends: some in front, some behind, touching. Keep each one exactly as it is: its own colours, markings, face and style. ${plainNote(note) && `The group also asks: ${plainNote(note)}. `}Nothing else in the picture. Transparent background, no shadow.` },
    providerOptions: { openai: { background: 'transparent', output_format: 'png' } },
  });
  return image.uint8Array;
};

/** The two sizes kept of a drawing: the whole thing with its empty edge cut away, and a 192px tile with the figures in the middle. */
async function sizes(drawn: Uint8Array): Promise<{ image: Buffer; small: Buffer }> {
  const image = await sharp(drawn).trim().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const figure = await sharp(image).resize(176, 176, { fit: 'inside' }).png().toBuffer();
  const small = await sharp({ create: { width: 192, height: 192, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: figure, gravity: 'centre' }]).png().toBuffer();
  return { image, small };
}

/** Whether the person runs the group, on the site: its owner or an organizer, on it or above it. An assistant never does this. */
const runs = async (q: Q, p: Principal, scope: Scope) => p.clientId === null && await canAccessLoop(q, p, scope.orgId, scope.loopId, 'manage');

/**
 * The animals a person may put in a group picture: the ones their own picker offers (everyone's, their school's, the
 * Ink ones when they have Ink) and the animals they had made. The admin may use every one.
 */
const mayUse = async (q: Q, p: Principal, admin: boolean) => new Set((await choices(q, p, admin)).map(one => key(one.pick)));

/** One animal the picker shows: what to send back to pick it, its picture, and what kind it is, for the mark on its corner. */
export type Choice = { pick: Pick; src: string; name: string; kind: 'own' | 'school' | 'ink' | 'core' };
/** Every animal the person may put in a group picture, in the order their own picker has them: theirs, their school's, the Ink ones, everyone's. */
async function choices(q: Q, p: Principal, admin: boolean): Promise<Choice[]> {
  const list = await offered(q, admin ? 'all' : await schoolOfPerson(q, p.personId));
  const tokenOf = (src: string) => src.slice(customFace('').length);
  const of = (tiles: { face: number | null; src: string; name: string }[], kind: Choice['kind']): Choice[] => tiles.map(tile => ({ pick: tile.face === null ? { token: tokenOf(tile.src) } : { face: tile.face }, src: tile.src, name: tile.name, kind }));
  const shown = [...of(list.school, 'school'), ...(admin || await hasInk(q, p.personId) ? of(list.premium, 'ink') : []), ...of(list.core, 'core')];
  const made = (admin ? (await q.query<{ token: string }>('select token::text as token from campus_custom_picture order by made_at,token')).rows
    : (await q.query<{ token: string }>('select token::text as token from campus_custom_picture where person_id=$1 and let_go_at is null order by made_at,token', [p.personId])).rows)
    .filter(row => !shown.some(one => 'token' in one.pick && one.pick.token === row.token));
  return [...made.map((row, at) => ({ pick: { token: row.token }, src: customFace(row.token), name: `Your own animal ${at + 1}`, kind: 'own' as const })), ...shown];
}

/** What the "Group picture" card needs to draw itself for a person who runs the group. Null for anyone else. */
export type PicturePane = { choices: Choice[]; fewest: number; most: number; plus: boolean; asksLeft: number | null; waiting: string[]; kept: string | null };
export async function picturePane(q: Q, p: Principal, scope: Scope): Promise<PicturePane | null> {
  const at = scopeSchema.parse(scope);
  if (!await runs(q, p, at)) return null;
  const admin = isAdmin(p);
  return { choices: await choices(q, p, admin), fewest: FEWEST, most: MOST, plus: admin || await hasInkPlus(q, p.personId), asksLeft: admin ? null : Math.max(0, ASKS - await asksMade(q, p.personId)),
    waiting: await waitingGroupPictures(q, p, at), kept: (await groupPictures(q, [at.loopId])).get(at.loopId) ?? null };
}

/** One picked animal as the model is given it: 512px, on white. */
async function pictureOf(q: Q, pick: Pick): Promise<Buffer> {
  const source = 'face' in pick ? path.join(process.cwd(), 'public', 'animals', `${String(pick.face + 1).padStart(2, '0')}.png`)
    : Buffer.from((await q.query<{ image: string }>("select encode(image,'base64') as image from campus_custom_picture where token=$1", [pick.token])).rows[0].image, 'base64');
  return sharp(source).resize(512, 512, { fit: 'contain', background: '#fff' }).flatten({ background: '#fff' }).png().toBuffer();
}

/**
 * "Draw us together". Whoever runs the group picks the animals, in any mix: they need not be anyone's face. Two
 * drawings are made at once and kept as drawings of one ask; neither is the group's picture until one is kept
 * (keepGroupPicture). A person who is not the admin must have asked for Ink+, and may ask ASKS times in all. An ask
 * that draws nothing is not counted. Returns the tokens of the drawings made: two, or one when the other failed.
 */
export async function askGroupPicture(db: Db, p: Principal, scope: Scope, picked: readonly Pick[], draw: DrawGroup = drawTogether, note = ''): Promise<{ ask: string; tokens: string[] }> {
  const at = scopeSchema.parse(scope), wanted = z.array(pickSchema).safeParse(picked);
  if (!wanted.success || wanted.data.length < FEWEST || wanted.data.length > MOST || new Set(wanted.data.map(key)).size !== wanted.data.length) throw new CampusError(HOW_MANY);
  const admin = isAdmin(p);
  const animals = await db.tx(async q => {
    if (!await runs(q, p, at)) throw new EmbaError('forbidden');
    if (!admin) {
      if (!await hasInkPlus(q, p.personId)) throw new CampusError(NEEDS_INK_PLUS);
      if (await asksMade(q, p.personId) >= ASKS) throw new CampusError(ALL_ASKED);
    }
    const allowed = await mayUse(q, p, admin);
    if (!wanted.data.every(pick => allowed.has(key(pick)))) throw new CampusError(NOT_THAT);
    return Promise.all(wanted.data.map(pick => pictureOf(q, pick)));
  });
  // The drawing is outside any transaction: it takes half a minute, and holds nothing while it waits.
  const drawn = await Promise.allSettled(Array.from({ length: DRAWINGS }, async () => sizes(await draw(animals, plainNote(note)))));
  const made = drawn.flatMap(one => one.status === 'fulfilled' ? [one.value] : []);
  if (!made.length) {
    // A provider's error can carry the request; only that it failed is kept.
    console.error('group picture: drawing failed', drawn.map(one => one.status === 'rejected' && one.reason instanceof Error ? one.reason.name : 'unknown').join(','));
    throw new CampusError(NOT_NOW);
  }
  const ask = randomUUID();
  return db.tx(async q => {
    // The person may have lost the group while it was drawn.
    if (!await runs(q, p, at)) throw new EmbaError('forbidden');
    const tokens: string[] = [];
    for (const one of made) tokens.push((await q.query<{ token: string }>("insert into emba_group_picture(org_id,loop_id,made_by,ask,picks,image,small) values($1,$2,$3,$4,$5::jsonb,decode($6,'base64'),decode($7,'base64')) returning token::text as token",
      [at.orgId, at.loopId, p.personId, ask, JSON.stringify(wanted.data), one.image.toString('base64'), one.small.toString('base64')])).rows[0].token);
    return { ask, tokens };
  });
}

/** How many times a person has had a group drawn. */
export const asksMade = async (q: Q, personId: string) => (await q.query<{ n: number }>('select count(distinct ask)::int as n from emba_group_picture where made_by=$1', [personId])).rows[0].n;

/**
 * Of the drawings of a group, whoever runs it keeps one: it is the group's picture from then on, and every other
 * drawing of the group that was still held, the picture it had before among them, is let go.
 */
export async function keepGroupPicture(db: Db, p: Principal, scope: Scope, token: string): Promise<void> {
  const at = scopeSchema.parse(scope);
  if (!z.uuid().safeParse(token).success) throw new CampusError('Pick one of the drawings.');
  await db.tx(async q => {
    if (!await runs(q, p, at)) throw new EmbaError('forbidden');
    const { rows: [kept] } = await q.query('update emba_group_picture set kept_at=now() where org_id=$1 and loop_id=$2 and token=$3 and let_go_at is null returning 1', [at.orgId, at.loopId, token]);
    if (!kept) throw new CampusError('Pick one of the drawings.');
    await q.query('update emba_group_picture set let_go_at=now() where org_id=$1 and loop_id=$2 and token<>$3 and let_go_at is null', [at.orgId, at.loopId, token]);
  });
}

/** The drawings of a group that wait to be kept or let go, newest ask first: what the person who runs it is choosing between. */
export async function waitingGroupPictures(q: Q, p: Principal, scope: Scope): Promise<string[]> {
  const at = scopeSchema.parse(scope);
  if (!await runs(q, p, at)) throw new EmbaError('forbidden');
  return (await q.query<{ token: string }>('select token::text as token from emba_group_picture where org_id=$1 and loop_id=$2 and kept_at is null and let_go_at is null order by made_at desc,token', [at.orgId, at.loopId])).rows.map(row => row.token);
}

/** The picture of each of these groups that has one, by the group's id: the token its addresses are made from. One statement for any number of groups. */
export async function groupPictures(q: Q, loopIds: readonly string[]): Promise<Map<string, string>> {
  if (!loopIds.length) return new Map();
  const { rows } = await q.query<{ loopId: string; token: string }>('select distinct on (loop_id) loop_id as "loopId",token::text as token from emba_group_picture where loop_id=any($1::uuid[]) and kept_at is not null and let_go_at is null order by loop_id,kept_at desc', [loopIds]);
  return new Map(rows.map(row => [row.loopId, row.token]));
}
/** The kept pictures of some groups, by group, for a page that lists them. A list is never lost to its pictures: if they cannot be read, every group has its rings. */
export async function groupPictureMap(db: Db, loopIds: readonly string[]): Promise<Record<string, string>> {
  try { return Object.fromEntries(await groupPictures(db, loopIds)); }
  catch (error) { console.error('group picture: list not read', error instanceof Error ? error.name : 'unknown'); return {}; }
}
/** What a group's tile needs: the picture the group wears, and, for a person who runs the group, what the card that draws one shows. */
export type TileProps = { scope: Scope; picture: string | null; pane: PicturePane | null };
/** Read for a group's page. A page is never lost to its tile: if the picture cannot be read, the tile is the rings. */
export async function groupTile(db: Db, p: Principal, scope: Scope): Promise<TileProps> {
  try {
    return await db.tx(async q => {
      const pane = await picturePane(q, p, scope);
      return { scope, pane, picture: pane ? pane.kept : (await groupPictures(q, [scope.loopId])).get(scope.loopId) ?? null };
    });
  } catch (error) {
    console.error('group picture: tile not read', error instanceof Error ? error.name : 'unknown');
    return { scope, picture: null, pane: null };
  }
}

/** The picture behind a token, for /animals/group/<token> and /animals/group/<token>/full. */
export async function groupPictureImage(q: Q, token: string, full = false): Promise<Uint8Array | null> {
  if (!z.uuid().safeParse(token).success) return null;
  // As text both ways: the two database drivers (live and test) do not agree on how bytes are handed over.
  const { rows: [row] } = await q.query<{ image: string }>(`select encode(${full ? 'image' : 'small'},'base64') as image from emba_group_picture where token=$1`, [token]);
  return row ? Buffer.from(row.image, 'base64') : null;
}
