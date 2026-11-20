import 'server-only';
import type { Q } from '../db';
import { collegeNamed, findColleges } from './colleges';
import { CampusError } from './errors';

// The school a person signs up when their email is at none of Loopd's schools (supabase/migrations/20261119200000_campus_school_ask.sql).
// They pick it from the list of US colleges (./colleges), so everyone who means one school gives one name. A school
// the list does not hold is kept as typed: "Other" (public/demo/mockups-school-search.html).

/** A school the search found. `here` is Loopd's name for it where Loopd is already at it, which leaves nothing to sign up. */
export type FoundSchool = { label: string; where: string; here: string | null };

/** The name of the campus an address on this web domain belongs to, or null: `columbia.edu` and `tc.columbia.edu` are both Columbia. */
async function campusAt(q: Q) {
  const campuses = (await q.query<{ name: string; domains: string[] }>('select name,domains from campus order by created_at,name')).rows;
  return (domain: string) => campuses.find(each => each.domains.some(one => domain === one || domain.endsWith(`.${one}`)))?.name ?? null;
}

/** What the box shows for what was typed: up to five colleges, the likeliest first, and how many match in all. */
export async function findSchools(q: Q, typed: string): Promise<{ found: FoundSchool[]; total: number }> {
  const { found, total } = findColleges(typed);
  if (!found.length) return { found: [], total };
  const here = await campusAt(q);
  return { found: found.map(each => ({ label: each.label, where: each.where, here: each.domain ? here(each.domain) : null })), total };
}

/**
 * "Sign up my school". One per person: another school replaces the first. `email` is the one they signed in with.
 * A school on the list is kept under the list's name for it. Anything else is kept as typed, and only when the list
 * has nothing like it: someone who typed "umich" is asked to pick the school it found.
 */
export async function askForSchool(q: Q, personId: string, school: string, email: string | null): Promise<void> {
  const typed = school.trim().replace(/\s+/g, ' ');
  if (typed.length < 2) throw new CampusError('Type the name of your school.');
  const listed = collegeNamed(typed);
  if (!listed && findColleges(typed, 1).total) throw new CampusError('Pick your school from the ones found.');
  const here = listed?.domain ? (await campusAt(q))(listed.domain) : null;
  if (here) throw new CampusError(`Loopd is already at ${here}.`);
  await q.query('insert into campus_school_ask(person_id,school,email) values($1,$2,$3) on conflict(person_id) do update set school=excluded.school,email=excluded.email,asked_at=now()', [personId, (listed?.label ?? typed).slice(0, 120), email]);
}

/** The school this person named, or null. Null too while the table is not there: the migration is run by hand, after the deploy. */
export async function schoolAsked(q: Q, personId: string): Promise<string | null> {
  try {
    return (await q.query<{ school: string }>('select school from campus_school_ask where person_id=$1', [personId])).rows[0]?.school ?? null;
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') return null;
    throw error;
  }
}

/**
 * A school people named, for the admin: `key` is the name in small letters, which is what makes two spellings one
 * school. `where` is its town when it is a college on the list, and null for a name someone typed in as "Other".
 */
export type AskedSchool = { key: string; school: string; where: string | null; people: number; last: string; emails: string[] };
/** For the admin: every school people named, the most asked first, each with how many asked, when last, and their emails (newest first). */
export async function schoolsAsked(q: Q): Promise<AskedSchool[]> {
  try {
    const rows = (await q.query<Omit<AskedSchool, 'where'>>(`select lower(school) as key,(array_agg(school order by asked_at desc))[1] as school,count(*)::int as people,to_char(max(asked_at),'YYYY-MM-DD') as last,
      coalesce(array_agg(email order by asked_at desc) filter (where email is not null),'{}') as emails from campus_school_ask group by lower(school) order by count(*) desc,max(asked_at) desc,lower(school)`)).rows;
    return rows.map(each => { const listed = collegeNamed(each.key); return { ...each, school: listed?.label ?? each.school, where: listed?.where ?? null }; });
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') return [];
    throw error;
  }
}
/** The admin takes a school off the list, with everyone who named it: for a name that is no school. */
export async function removeAskedSchool(q: Q, key: string): Promise<void> {
  await q.query('delete from campus_school_ask where lower(school)=$1', [key.trim().toLowerCase()]);
}
