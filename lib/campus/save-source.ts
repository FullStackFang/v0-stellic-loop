import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Q } from '../db';
import { canAccessLoop, type Principal } from '../emba/access';
import { groupPictureImage, groupPictures } from '../emba/group-picture';
import { isAdmin } from './admin';
import { animal, animalOf, CUSTOM, PHOTO } from './animals';
import { customFaceLarge } from './custom-face';
import { hasInkPlus } from './ink';
import { firstNames } from './people';

// Whose picture is saved, and under what name (openspec loop-save-picture, design D7): a person saves the animal they
// wear, and a member of a group saves the group's drawn picture.

/** What the saved picture is made from. `figure` is null when there is no animal to save: the person wears their own photo, or the group has no drawing. */
export type Source = { figure: Uint8Array | null; name: string };

/** The animal a person wears, as large as Loopd has it, and their name. */
export async function ownSource(q: Q, personId: string): Promise<Source> {
  const { rows: [worn] } = await q.query<{ face: number | null; token: string | null }>(`select c.face,(select p.token::text from campus_custom_picture p where p.token=coalesce(c.picture,f.token)) as token
    from (select $1::uuid as id) i left join campus_face c on c.person_id=i.id left join campus_custom_face f on f.person_id=i.id`, [personId]);
  const name = (await firstNames(q, [personId])).get(personId)?.name ?? 'Someone';
  if (worn?.face === PHOTO) return { figure: null, name };
  if (worn?.face === CUSTOM && worn.token) return { figure: await customFaceLarge(q, worn.token), name };
  const face = worn?.face == null || worn.face < 0 ? animalOf(personId) : worn.face;
  return { figure: await readFile(path.join(process.cwd(), 'public', animal(face))), name };
}

/** A group's drawn picture and the group's name, for anyone who may open the group. Null for anyone else, and for a group that is not there. */
export async function groupSource(q: Q, principal: Principal, scope: { orgId: string; loopId: string }): Promise<Source | null> {
  if (!await canAccessLoop(q, principal, scope.orgId, scope.loopId, 'read')) return null;
  const { rows: [group] } = await q.query<{ name: string }>('select coalesce(l.name,o.name) as name from emba_loop l join emba_organization o on o.id=l.org_id where l.org_id=$1 and l.id=$2', [scope.orgId, scope.loopId]);
  if (!group) return null;
  const token = (await groupPictures(q, [scope.loopId])).get(scope.loopId);
  return { figure: token ? await groupPictureImage(q, token, true) : null, name: group.name };
}

/** Whether a person may have a picture without the Loopd mark: with Ink+, or as the admin. */
export const mayDropMark = async (q: Q, principal: Principal) => isAdmin(principal) || await hasInkPlus(q, principal.personId);
