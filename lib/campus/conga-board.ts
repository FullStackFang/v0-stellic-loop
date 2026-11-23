import 'server-only';
import type { Q } from '../db';
import { UNNAMED } from '../emba/member-name';
import { MAPS } from '@/public/conga/maps.js';
import { GIANT } from '@/public/conga/sim.js';
import type { CongaPlayer } from './conga';

// Conga's weekly board (/demo/mockups-conga-board.html, A): each map's top players this week, a week being Monday to
// Sunday in New York. Only signed-in players are on it, with their best of the week; last week's rows stop being shown.

/** The week a moment falls in, worked out in the database so every reader agrees: its Monday, in New York. */
const WEEK = `(date_trunc('week', now() at time zone 'America/New_York'))::date`;
/** How many of the top a board shows. */
export const TOP = 5;
/** One row: a place on the board (1 on), who, the animal their best was played as, their school, and their best. `you`: the reader. */
export type BoardRow = { place: number; name: string; face: number; picture: string | null; kit: string; best: number; you: boolean };
export type Boards = Record<string, BoardRow[]>;

export const congaMaps = () => Object.keys(MAPS);

/** "Maya R." from "Maya Rodriguez": a first name and the last name's first letter. */
export function shortName(name: string): string {
  const parts = name === UNNAMED ? [] : name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Someone';
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0].toUpperCase()}.` : parts[0];
}

/** This week's board for every map: the top TOP, and the reader's own row after them when they are further down. */
export async function congaBoards(q: Q, personId: string | null): Promise<Boards> {
  const { rows } = await q.query<{ map: string; place: number; name: string; face: number; picture: string | null; kit: string; best: number; you: boolean }>(
    `select * from (
       select b.map, rank() over (partition by b.map order by b.best desc, b.at)::int as place, p.name, b.face, b.picture, b.kit, b.best,
         b.person_id = $1::uuid is true as you
       from conga_best b join person p on p.id = b.person_id where b.week = ${WEEK}) ranked
     where place <= ${TOP} or you order by map, place`, [personId]);
  const boards: Boards = Object.fromEntries(congaMaps().map(map => [map, []]));
  for (const { map, name, ...row } of rows) boards[map]?.push({ ...row, name: shortName(name) });
  return boards;
}

/**
 * A round's line, kept as the player's best on that map this week if it beats what is kept. What a browser says is
 * checked as far as it can be: a known map, a line no longer than a line can be, and no more than a round that long could
 * gather (CHEAT_RATE animals a second on top of a CHEAT_START head start, generous: a burst line's sacks come all at once).
 * The animal must be one of the player's own, else their first is kept. False when it was refused.
 */
const CHEAT_START = 30, CHEAT_RATE = 15, LONGEST_ROUND = 6 * 3600;
export async function saveBest(q: Q, personId: string, player: CongaPlayer, round: { map: string; best: number; seconds: number; face: number; picture: string | null }): Promise<boolean> {
  const { map, best, seconds } = round;
  if (!congaMaps().includes(map) || !Number.isInteger(best) || best < 1 || best > GIANT + 1) return false;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > LONGEST_ROUND || best > CHEAT_START + CHEAT_RATE * seconds) return false;
  const worn = player.animals.find(animal => round.face ? animal.face === round.face : animal.picture === round.picture) ?? player.animals[0];
  await q.query(
    `insert into conga_best(person_id, map, week, best, face, picture, kit) values ($1, $2, ${WEEK}, $3, $4, $5, $6)
     on conflict (person_id, map, week) do update set best = excluded.best, face = excluded.face, picture = excluded.picture, kit = excluded.kit, at = now()
     where conga_best.best < excluded.best`,
    [personId, map, best, worn.face, worn.picture, player.kit]);
  return true;
}
