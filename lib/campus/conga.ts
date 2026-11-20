import 'server-only';
import type { Q } from '../db';
import type { Principal } from '../emba/access';
import { ANIMALS, animalOf, CUSTOM, customFace, MASCOT, PREMIUM } from './animals';
import { picks, schoolsOfPerson } from './animal-tiers';
import { customFaces } from './custom-face';
import { hasInkPlus } from './ink';

// Who is playing Conga (public/conga), for the game's first card: the animals that are theirs to play as, and whether
// they have Ink+. With Ink+ they play as one of their own, a pet they had made included, and it sparkles as it goes.

/**
 * One animal. `face` is its place on the game's sheet of animals, 1 on (scripts/conga-atlas.mjs draws public/animals
 * in order), or 0 for a made animal, whose picture is at `picture`. `kit` is the school whose colours its sparkle
 * wears: the school a mascot belongs to, else the player's own.
 */
export type CongaAnimal = { face: number; picture: string | null; kit: string };
/** `animals` starts with the one the person wears on campus. Without Ink+ that is the only one. */
export type CongaPlayer = { ink: boolean; kit: string; animals: CongaAnimal[] };

export async function congaPlayer(q: Q, who: { personId: string; principal: Principal; admin: boolean; kit: string }): Promise<CongaPlayer> {
  const made = (await customFaces(q, [who.personId])).get(who.personId), worn = (await q.query<{ face: number }>('select face from campus_face where person_id=$1', [who.personId])).rows[0]?.face;
  const ink = who.admin || await hasInkPlus(q, who.personId);
  const built = (face: number): CongaAnimal => ({ face: face % (ANIMALS + PREMIUM.length) + 1, picture: null, kit: MASCOT[face] ?? who.kit });
  const pet = (src: string): CongaAnimal => ({ face: 0, picture: src, kit: who.kit });
  // Someone who wears their sign-in photo plays as the animal they were given.
  const first = worn === CUSTOM && made?.token ? pet(customFace(made.token)) : built(worn == null || worn < 0 ? animalOf(who.personId) : worn);
  if (!ink) return { ink, kit: who.kit, animals: [first] };
  // With Ink+: every pet they had made, their schools' own animals, and the premium ones.
  const offered = await picks(q, who.admin ? 'all' : await schoolsOfPerson(q, who.personId));
  const rest = [...(made?.all ?? []).map(token => pet(customFace(token))), ...[...offered.school, ...offered.premium].map(tile => tile.face == null ? pet(tile.src) : built(tile.face))];
  const key = (each: CongaAnimal) => each.picture ?? each.face, seen = new Set([key(first)]);
  return { ink, kit: who.kit, animals: [first, ...rest.filter(each => !seen.has(key(each)) && seen.add(key(each)))] };
}
