import 'server-only';
import type { Q } from '../db';
import { CampusError } from './errors';

// The school a person names when their email is at none of Loopd's schools (supabase/migrations/20261119200000_campus_school_ask.sql).

/** "Add my school". One per person: naming another school replaces the first. `email` is the one they signed in with. */
export async function askForSchool(q: Q, personId: string, school: string, email: string | null): Promise<void> {
  const name = school.trim().replace(/\s+/g, ' ');
  if (name.length < 2) throw new CampusError('Type the name of your school.');
  await q.query('insert into campus_school_ask(person_id,school,email) values($1,$2,$3) on conflict(person_id) do update set school=excluded.school,email=excluded.email,asked_at=now()', [personId, name.slice(0, 120), email]);
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

/** A school people named, for the admin: `key` is the name in small letters, which is what makes two spellings one school. */
export type AskedSchool = { key: string; school: string; people: number; last: string; emails: string[] };
/** For the admin: every school people named, the most asked first, each with how many asked, when last, and their emails (newest first). */
export async function schoolsAsked(q: Q): Promise<AskedSchool[]> {
  try {
    return (await q.query<AskedSchool>(`select lower(school) as key,(array_agg(school order by asked_at desc))[1] as school,count(*)::int as people,to_char(max(asked_at),'YYYY-MM-DD') as last,
      coalesce(array_agg(email order by asked_at desc) filter (where email is not null),'{}') as emails from campus_school_ask group by lower(school) order by count(*) desc,max(asked_at) desc,lower(school)`)).rows;
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') return [];
    throw error;
  }
}
/** The admin takes a school off the list, with everyone who named it: for a name that is no school. */
export async function removeAskedSchool(q: Q, key: string): Promise<void> {
  await q.query('delete from campus_school_ask where lower(school)=$1', [key.trim().toLowerCase()]);
}
