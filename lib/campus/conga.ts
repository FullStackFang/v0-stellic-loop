import 'server-only';
import type { Q } from '../db';
import type { Principal } from '../emba/access';
import { ANIMALS, animalOf, CUSTOM, customFace, MASCOT, PREMIUM } from './animals';
import { picks, schoolsOfPerson } from './animal-tiers';
import { customFaces } from './custom-face';
import { planOf } from './ink';

// Who is playing Conga (public/conga) and Seats, for the game's first card: the animals that are theirs to play as, and
// their plan (openspec loop-ink-tiers). With Ink, or Ink+ which holds it, they play as one of their own, a pet they had
// made included. With Ink+ it also sparkles as it goes.

/**
 * One animal. `face` is its place on the game's sheet of animals, 1 on (scripts/conga-atlas.mjs draws public/animals
 * in order), or 0 for a made animal, whose picture is at `picture`. `kit` is the school whose colours its sparkle
 * wears: the school a mascot belongs to, else the player's own.
 */
export type CongaAnimal = { face: number; picture: string | null; kit: string };
/**
 * `animals` starts with the one the person wears on campus. Without Ink that is the only one. `ink`: they have Ink or Ink+;
 * `plus`: Ink+, and their animal sparkles, and every school's ground is theirs to play. `schools`: their own schools
 * (the one they are at, then the ones LinkedIn added), whose grounds they play free.
 */
export type CongaPlayer = { ink: boolean; plus: boolean; kit: string; schools: string[]; animals: CongaAnimal[] };

export async function congaPlayer(q: Q, who: { personId: string; principal: Principal; admin: boolean; kit: string }): Promise<CongaPlayer> {
  const made = (await customFaces(q, [who.personId])).get(who.personId), worn = (await q.query<{ face: number }>('select face from campus_face where person_id=$1', [who.personId])).rows[0]?.face;
  const plan = await planOf(q, who.personId), plus = who.admin || plan === 'plus', ink = plus || plan === 'ink';
  const built = (face: number): CongaAnimal => ({ face: face % (ANIMALS + PREMIUM.length) + 1, picture: null, kit: MASCOT[face] ?? who.kit });
  const pet = (src: string): CongaAnimal => ({ face: 0, picture: src, kit: who.kit });
  // Someone who wears their sign-in photo plays as the animal they were given.
  const first = worn === CUSTOM && made?.token ? pet(customFace(made.token)) : built(worn == null || worn < 0 ? animalOf(who.personId) : worn);
  const schools = await schoolsOfPerson(q, who.personId);
  if (!ink) return { ink, plus, kit: who.kit, schools, animals: [first] };
  // With Ink: every pet they had made, their schools' own animals, and the premium ones.
  const offered = await picks(q, who.admin ? 'all' : schools);
  const rest = [...(made?.all ?? []).map(token => pet(customFace(token))), ...[...offered.school, ...offered.premium].map(tile => tile.face == null ? pet(tile.src) : built(tile.face))];
  const key = (each: CongaAnimal) => each.picture ?? each.face, seen = new Set([key(first)]);
  return { ink, plus, kit: who.kit, schools, animals: [first, ...rest.filter(each => !seen.has(key(each)) && seen.add(key(each)))] };
}
