import 'server-only';
import type { Q } from '../db';
import { nameSchema } from './team-text';

/** What a person is called until a name is known: at first sign-in the provider may have none. */
export const UNNAMED = 'Member';
/** A name as typed by a person: one line, single spaces, 80 characters at most. Null when nothing is left. */
export const cleanName = (raw: string) => raw.replace(/\s+/g, ' ').trim().slice(0, 80).trim() || null;

const plain = (word: string) => word.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Tags to try for a name, in order: the first name, the first name with the last initial, then numbered. */
function candidates(name: string): string[] {
  const words = name.split(' ').map(plain).filter(Boolean), first = words[0]?.slice(0, 40);
  // A first name that cannot be a tag by itself (one letter, or a reserved word) gives none: "p-2" would name nobody.
  if (!first || !nameSchema.safeParse(first).success) return [];
  const last = words.length > 1 ? words.at(-1)![0] : null;
  return [first, ...(last ? [`${first}-${last}`] : []), ...[2, 3, 4, 5, 6, 7, 8, 9].map(n => `${first}-${n}`)];
}

/** Sets a person's name where none is known yet. A name already set is kept. */
export async function nameIfUnnamed(q: Q, personId: string, name: string | null): Promise<boolean> {
  const clean = name && cleanName(name);
  if (!clean || clean === UNNAMED) return false;
  return (await q.query('update person set name=$2 where id=$1 and name=$3 returning id', [personId, clean, UNNAMED])).rows.length > 0;
}

/**
 * Gives a member of a top-level group a tag made from their first name, so teammates' assistants can name them at once.
 * Nothing happens for a person with no name yet, one who is not a member, or one who already has a tag: a tag a person
 * chose is never replaced, and they can change this one on the Members page.
 */
export async function giveDefaultHandle(q: Q, orgId: string, personId: string): Promise<void> {
  const { rows: [person] } = await q.query<{ name: string }>(
    `select p.name from person p join emba_membership m on m.person_id=p.id and m.org_id=$1 and m.revoked_at is null
     where p.id=$2 and not exists(select 1 from emba_member_handle h where h.org_id=$1 and h.person_id=p.id)`, [orgId, personId]);
  if (!person || person.name === UNNAMED) return;
  const tries = candidates(person.name);
  if (!tries.length) return;
  // emba_team_name holds every name in use in the group: its own, its groups, events and people.
  const { rows: taken } = await q.query<{ name: string }>('select name from emba_team_name where org_id=$1 and name=any($2::text[])', [orgId, tries]);
  const free = tries.find(tag => !taken.some(row => row.name === tag));
  if (free) await q.query('insert into emba_member_handle(org_id,person_id,handle) values($1,$2,$3)', [orgId, personId, free]);
}
