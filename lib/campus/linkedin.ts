import 'server-only';
import type { Db, Q } from '../db';
import { CampusError } from './errors';
import { listCampuses } from './listings';
import { schoolOf, schoolOfEmail } from './schools';

// Schools a person unlocks by adding the address of their LinkedIn profile (supabase/migrations/20261119300000_campus_linkedin.sql).
// Nothing is read from LinkedIn. The address has to look like a profile's, and one profile is for one person.
// Someone who signed in with LinkedIn gives no address: the account is proven theirs, and the admin looks them up by its name (migration 20261120100000).
// A person whose email is at no school waits for the admin to look at the profile and approve it (migration 20261119400000).

// The table, or its approved_at column, is not there yet: the migrations are run by hand, after the deploy.
const missing = (error: unknown) => ['42P01', '42703'].includes((error as { code?: string }).code ?? '');

/** A LinkedIn profile's address in one spelling, or null for anything that is not one. */
export function profileOf(typed: string): string | null {
  const hit = /^(?:https?:\/\/)?(?:[a-z]{1,3}\.)?linkedin\.com\/in\/([^/?#\s]{3,100})\/?(?:[?#]\S*)?$/i.exec(String(typed).trim());
  return hit ? `https://www.linkedin.com/in/${hit[1].toLowerCase()}` : null;
}

/** Whether a row may be kept with no profile address yet: false until migration 20261120100000 is run, and the page then still asks for the address. */
export async function profileOptional(q: Q): Promise<boolean> {
  return (await q.query("select 1 from information_schema.columns where table_schema=current_schema() and table_name='campus_linkedin' and column_name='profile' and is_nullable='YES'")).rows.length > 0;
}

/**
 * The profile a person added and the schools it unlocked, beyond the one they are placed at. While the admin has not
 * approved it, it unlocks nothing: the schools they ticked are `waiting`. Nothing while the table is not there.
 */
export async function addedSchools(q: Q, personId: string): Promise<{ profile: string | null; added: string[]; waiting: string[] }> {
  try {
    const row = (await q.query<{ profile: string | null; schools: string[]; approved: boolean }>('select profile,schools,approved_at is not null as approved from campus_linkedin where person_id=$1', [personId])).rows[0];
    return { profile: row?.profile ?? null, added: row?.approved ? row.schools : [], waiting: row && !row.approved ? row.schools : [] };
  } catch (error) {
    if (missing(error)) return { profile: null, added: [], waiting: [] };
    throw error;
  }
}

/**
 * "Unlock": the person's profile and the schools they tick. A person placed at a school keeps it, and the others are
 * added to it at once. A person at no school has to tick one, and then waits: nothing opens for them until the admin
 * approves the profile (approveLinkedin).
 * `owner` is the name on the LinkedIn account they signed in with or connected, if they did (lib/campus/linkedin-account.ts).
 * With it the address may be left out, and one sent before is then kept. Without it the address is required.
 */
export async function setSchools(db: Db, who: { personId: string; verifiedEmail: string | null }, typed: string, ticked: readonly string[], owner: string | null = null): Promise<void> {
  const ASK = 'Paste the address of your LinkedIn profile, like linkedin.com/in/your-name.';
  const blank = !String(typed).trim(), profile = blank ? null : profileOf(typed);
  if (!profile && !(blank && owner?.trim())) throw new CampusError(ASK);
  const campuses = await listCampuses(db), known = new Set(campuses.map(each => schoolOf(each.slug)));
  const picked = [...new Set(ticked.map(String))];
  if (picked.some(school => !known.has(school))) throw new CampusError('Pick from the schools Loopd is at.');
  const placed = (await db.query<{ slug: string }>('select c.slug from campus_person p join campus c on c.id=p.campus_id where p.person_id=$1', [who.personId])).rows[0]?.slug;
  if (!placed && !picked.length) throw new CampusError('Pick at least one school.');
  try {
    // Someone placed is approved as they save, and stays approved. Someone not placed waits, and saving again keeps them waiting.
    await db.query(`insert into campus_linkedin(person_id,profile,schools,email,approved_at) values($1,$2,$3,$4,case when $5::boolean then now() end)
      on conflict(person_id) do update set profile=coalesce(excluded.profile,campus_linkedin.profile),schools=excluded.schools,email=excluded.email,approved_at=case when $5::boolean then coalesce(campus_linkedin.approved_at,now()) end`,
      [who.personId, profile, placed ? picked.filter(school => school !== schoolOf(placed)) : picked, who.verifiedEmail, !!placed]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new CampusError('That LinkedIn profile is already on another account.');
    // No address, on a database where one is still required (migration 20261120100000 not run).
    if ((error as { code?: string }).code === '23502') throw new CampusError(ASK);
    throw error;
  }
  // Kept apart, so that sending still works before the column is there (migration 20261119500000).
  try { await db.query('update campus_linkedin set owner_name=$2 where person_id=$1', [who.personId, owner?.trim().slice(0, 200) || null]); } catch (error) { if (!missing(error)) throw error; }
}

/** `owner` is the name on the LinkedIn account the person signed in with, or null when they only pasted an address. `profile` is null for someone who signed in with LinkedIn and was not asked for it. `days` is how many whole days ago they sent it. */
export type LinkedinPerson = { personId: string; name: string; email: string | null; profile: string | null; schools: string[]; added: string; days: number; waiting: boolean; owner: string | null };
/** For the admin: everyone who added a profile, the ones waiting for approval first and then the newest, with every school it got them or would. */
export async function linkedinPeople(q: Q): Promise<LinkedinPerson[]> {
  try {
    const { rows } = await q.query<LinkedinPerson & { placed: string | null }>(`select l.person_id as "personId",p.name,l.email,l.profile,l.schools,to_char(l.added_at,'YYYY-MM-DD') as added,floor(extract(epoch from now()-l.added_at)/86400)::int as days,l.approved_at is null as waiting,to_jsonb(l)->>'owner_name' as owner,c.slug as placed
      from campus_linkedin l join person p on p.id=l.person_id left join campus_person cp on cp.person_id=l.person_id left join campus c on c.id=cp.campus_id order by l.approved_at is not null,l.added_at desc,l.person_id`);
    return rows.map(({ placed, ...row }) => ({ ...row, schools: [...new Set([...(placed ? [schoolOf(placed)] : []), ...row.schools])] }));
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}

/**
 * "Approve": the admin has looked at the profile of someone whose email is at no school. They are placed at the first
 * school they ticked, on its first campus, and the others are theirs to look at. Nothing happens for someone not waiting.
 */
export async function approveLinkedin(db: Db, personId: string): Promise<void> {
  const campuses = await listCampuses(db);
  await db.tx(async q => {
    const row = (await q.query<{ schools: string[] }>('select schools from campus_linkedin where person_id=$1 and approved_at is null for update', [personId])).rows[0];
    if (!row) return;
    const placed = (await q.query('select 1 from campus_person where person_id=$1', [personId])).rows.length > 0, [home, ...rest] = row.schools;
    const own = campuses.filter(each => schoolOf(each.slug) === home), at = own.find(each => each.slug === home) ?? own[0];
    if (!placed && at) await q.query('insert into campus_person(person_id,campus_id) values($1,$2) on conflict do nothing', [personId, at.id]);
    await q.query('update campus_linkedin set approved_at=now(),schools=$2 where person_id=$1', [personId, placed || !at ? row.schools : rest]);
  });
}

/** The admin takes a profile away, and with it what it unlocked. Someone it let in, whose email is at no school, has no campus again. */
export async function removeLinkedin(db: Db, personId: string): Promise<void> {
  const campuses = await listCampuses(db);
  await db.tx(async q => {
    const row = (await q.query<{ email: string | null }>('delete from campus_linkedin where person_id=$1 returning email', [personId])).rows[0];
    if (row && !schoolOfEmail(campuses, row.email)) await q.query('delete from campus_person where person_id=$1', [personId]);
  });
}
