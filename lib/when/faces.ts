import type { Q } from '../db';
import { animal, animalOf, customFace } from '../campus/animals';
import { customFaces } from '../campus/custom-face';
import { pickedFaces } from '../campus/people';

/** The picture each person wears on a Loopd When screen: the animal they picked or had made, or else the one they were given. */
export async function facesOf(q: Q, personIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(personIds)];
  const [picked, made] = await Promise.all([pickedFaces(q, ids), customFaces(q, ids)]).catch(() => [new Map<string, number>(), new Map<string, { token: string | null }>()] as const);
  return new Map(ids.map(id => { const pick = picked.get(id), token = made.get(id)?.token; return [id, pick !== undefined && pick >= 0 ? animal(pick) : token ? customFace(token) : animal(animalOf(id))]; }));
}
