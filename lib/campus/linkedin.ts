import 'server-only';
import type { Db, Q } from '../db';
import { CampusError } from './errors';
import { listCampuses } from './listings';
import { schoolOf, schoolOfEmail } from './schools';
import { nearestCampus, type Point } from './sections';

// Schools a person unlocks by adding the address of their LinkedIn profile (supabase/migrations/20261119300000_campus_linkedin.sql).
// Nothing is read from LinkedIn. The address has to look like a profile's, and one profile is for one person.

const missing = (error: unknown) => (error as { code?: string }).code === '42P01';

/** A LinkedIn profile's address in one spelling, or null for anything that is not one. */
export function profileOf(typed: string): string | null {
  const hit = /^(?:https?:\/\/)?(?:[a-z]{1,3}\.)?linkedin\.com\/in\/([^/?#\s]{3,100})\/?(?:[?#]\S*)?$/i.exec(String(typed).trim());
  return hit ? `https://www.linkedin.com/in/${hit[1].toLowerCase()}` : null;
}

/** The profile a person added and the schools it unlocked, beyond the one they are placed at. Nothing while the table is not there: the migration is run by hand, after the deploy. */
export async function addedSchools(q: Q, personId: string): Promise<{ profile: string | null; added: string[] }> {
  try {
    const row = (await q.query<{ profile: string; schools: string[] }>('select profile,schools from campus_linkedin where person_id=$1', [personId])).rows[0];
    return { profile: row?.profile ?? null, added: row?.schools ?? [] };
  } catch (error) {
    if (missing(error)) return { profile: null, added: [] };
    throw error;
  }
}

/**
 * "Unlock": the person's profile and the schools they tick. A person placed at a school keeps it, and the others are
 * added to it. A person at no school is placed at the first one they tick, nearest `near` where it has more than one
 * campus, which is what lets them in; they have to tick one.
 */
export async function setSchools(db: Db, who: { personId: string; verifiedEmail: string | null }, typed: string, ticked: readonly string[], near?: Point | null): Promise<void> {
  const profile = profileOf(typed);
  if (!profile) throw new CampusError('Paste the address of your LinkedIn profile, like linkedin.com/in/your-name.');
  const campuses = await listCampuses(db), known = new Set(campuses.map(each => schoolOf(each.slug)));
  const picked = [...new Set(ticked.map(String))];
  if (picked.some(school => !known.has(school))) throw new CampusError('Pick from the schools Loop is at.');
  const placed = (await db.query<{ slug: string }>('select c.slug from campus_person p join campus c on c.id=p.campus_id where p.person_id=$1', [who.personId])).rows[0]?.slug;
  const home = placed ? schoolOf(placed) : picked[0];
  if (!home) throw new CampusError('Pick at least one school.');
  try {
    await db.tx(async q => {
      await q.query('insert into campus_linkedin(person_id,profile,schools,email) values($1,$2,$3,$4) on conflict(person_id) do update set profile=excluded.profile,schools=excluded.schools,email=excluded.email',
        [who.personId, profile, picked.filter(school => school !== home), who.verifiedEmail]);
      if (!placed) {
        const own = campuses.filter(each => schoolOf(each.slug) === home), at = nearestCampus(own, near) ?? own.find(each => each.slug === home) ?? own[0];
        await q.query('insert into campus_person(person_id,campus_id) values($1,$2) on conflict do nothing', [who.personId, at.id]);
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new CampusError('That LinkedIn profile is already on another account.');
    throw error;
  }
}

export type LinkedinPerson = { personId: string; name: string; email: string | null; profile: string; schools: string[]; added: string };
/** For the admin: everyone who added a profile, the newest first, with every school it got them. */
export async function linkedinPeople(q: Q): Promise<LinkedinPerson[]> {
  try {
    const { rows } = await q.query<LinkedinPerson & { placed: string | null }>(`select l.person_id as "personId",p.name,l.email,l.profile,l.schools,to_char(l.added_at,'YYYY-MM-DD') as added,c.slug as placed
      from campus_linkedin l join person p on p.id=l.person_id left join campus_person cp on cp.person_id=l.person_id left join campus c on c.id=cp.campus_id order by l.added_at desc,l.person_id`);
    return rows.map(({ placed, ...row }) => ({ ...row, schools: [...new Set([...(placed ? [schoolOf(placed)] : []), ...row.schools])] }));
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}

/** The admin takes a profile away, and with it what it unlocked. Someone it let in, whose email is at no school, has no campus again. */
export async function removeLinkedin(db: Db, personId: string): Promise<void> {
  const campuses = await listCampuses(db);
  await db.tx(async q => {
    const row = (await q.query<{ email: string | null }>('delete from campus_linkedin where person_id=$1 returning email', [personId])).rows[0];
    if (row && !schoolOfEmail(campuses, row.email)) await q.query('delete from campus_person where person_id=$1', [personId]);
  });
}
