import 'server-only';
import type { Q } from '../db';
import type { Principal } from '../emba/access';
import { isAdmin } from './admin';
import { ANIMALS, animalOf, CUSTOM, customFace, PREMIUM } from './animals';
import { hasInkPlus } from './ink';

// Who is playing Conga (public/conga), for the game's first card: the animal they wear on campus, and whether they
// have Ink+. With Ink+ they may play as that animal, their own pet included, and it sparkles as it goes.

/**
 * `face` is the animal's place on the game's sheet of animals, 1 on (scripts/conga-atlas.mjs draws public/animals in
 * order), or 0 for a pet of their own, whose picture is at `picture`. Someone who wears their sign-in photo plays as
 * the animal they were given.
 */
export type CongaPlayer = { face: number; picture: string | null; ink: boolean };

export async function congaPlayer(q: Q, who: { personId: string; principal: Principal }): Promise<CongaPlayer> {
  const { rows: [worn] } = await q.query<{ face: number | null; token: string | null }>(`select c.face,(select p.token::text from campus_custom_picture p where p.token=coalesce(c.picture,f.token)) as token
    from (select $1::uuid as id) i left join campus_face c on c.person_id=i.id left join campus_custom_face f on f.person_id=i.id`, [who.personId]);
  const ink = isAdmin(who.principal) || await hasInkPlus(q, who.personId);
  if (worn?.face === CUSTOM && worn.token) return { face: 0, picture: customFace(worn.token), ink };
  const pick = worn?.face == null || worn.face < 0 ? animalOf(who.personId) : worn.face;
  return { face: pick % (ANIMALS + PREMIUM.length) + 1, picture: null, ink };
}
