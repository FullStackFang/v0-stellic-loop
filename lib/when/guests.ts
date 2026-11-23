import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { POLL_ID, WhenError, pollRow, read, saveAnswer, type Who } from './polls';

// Loopd When without an account: someone with the link types a name and saves their hours. They are a person like any
// other, marked as a guest and found again by a random key kept in their browser (only its hash is stored here).

export type Guest = Who & { name: string };
const KEY = /^[0-9a-f]{32}$/, MOST = 200;
const hashOf = (key: string) => createHash('sha256').update(key).digest('hex');
const GuestAnswer = z.object({
  pollId: z.string().regex(POLL_ID), slots: z.unknown(),
  name: z.string().transform(value => value.replace(/\s+/g, ' ').trim()).pipe(z.string().min(1).max(40)),
});
const InviteEmail = z.object({ pollId: z.string().regex(POLL_ID), email: z.string().transform(value => value.trim().toLowerCase()).pipe(z.string().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) });

/** The guest a browser's key names, or null. */
export async function guestOf(q: Q, key: string | undefined | null): Promise<Guest | null> {
  if (!key || !KEY.test(key)) return null;
  return (await q.query<Guest>('select p.id as "personId",p.name from when_guest g join person p on p.id=g.person_id where g.key_hash=$1', [hashOf(key)])).rows[0] ?? null;
}

/**
 * Keeps a guest's hours for a poll under the name they typed. A browser with no key yet gets one, and a guest who
 * types a new name is renamed. A poll takes at most two hundred answers.
 */
export async function saveGuestAnswer(db: Db, key: string | undefined | null, input: unknown, now = new Date()): Promise<{ key: string; ready: boolean }> {
  const answer = read(GuestAnswer, input);
  if (!await pollRow(db, answer.pollId)) throw new WhenError('not_found');
  let guest = await guestOf(db, key), made = false, mine = key ?? '';
  const { rows: [n] } = await db.query<{ all: number; own: number }>('select count(*)::int as all,count(*) filter (where person_id=$2)::int as own from when_answer where poll_id=$1', [answer.pollId, guest?.personId ?? null]);
  if (n.all >= MOST && !n.own) throw new WhenError('full');
  if (!guest) {
    mine = randomBytes(16).toString('hex'); made = true;
    guest = await db.tx(async q => {
      const { rows: [person] } = await q.query<{ id: string }>('insert into person(phone,name,show_name,sms_opt_out) values(null,$1,true,true) returning id', [answer.name]);
      await q.query('insert into when_guest(person_id,key_hash) values($1,$2)', [person.id, hashOf(mine)]);
      return { personId: person.id, name: answer.name };
    });
  } else if (guest.name !== answer.name) await db.query('update person set name=$2 where id=$1', [guest.personId, answer.name]);
  try {
    return { key: mine, ready: (await saveAnswer(db, guest, { pollId: answer.pollId, slots: answer.slots }, now)).ready };
  } catch (error) {
    // Nothing was kept, so the person made for it goes too.
    if (made) await db.query('delete from person where id=$1', [guest.personId]);
    throw error;
  }
}

/** Keeps the address a guest wants this poll's invite sent to. An invite that already failed for want of one is tried again. */
export async function saveInviteEmail(db: Db, key: string | undefined | null, input: unknown): Promise<void> {
  const { pollId, email } = read(InviteEmail, input), guest = await guestOf(db, key);
  if (!guest) throw new WhenError('forbidden');
  const { rows } = await db.query('update when_answer set invite_email=$3 where poll_id=$1 and person_id=$2 and not draft returning poll_id', [pollId, guest.personId, email]);
  if (!rows.length) throw new WhenError('not_found');
  await db.query(`update when_message set state='queued',attempts=0,claimed_at=null where poll_id=$1 and person_id=$2 and kind='invite' and state='failed'`, [pollId, guest.personId]);
}

/** The guests among a poll's people, each with the address they left for its invite, if any. */
export async function guestsOn(q: Q, pollId: string): Promise<Map<string, { email: string | null }>> {
  const { rows } = await q.query<{ personId: string; email: string | null }>('select a.person_id as "personId",a.invite_email as email from when_answer a join when_guest g on g.person_id=a.person_id where a.poll_id=$1', [pollId]);
  return new Map(rows.map(row => [row.personId, { email: row.email }]));
}

/**
 * A guest signed in: what they answered under a name becomes their account's, and the guest is gone. Where the account
 * already has its own counted answer, that one stands. Returns how many answers moved.
 */
export async function claimGuest(db: Db, who: Who, key: string | undefined | null): Promise<number> {
  const guest = await guestOf(db, key);
  if (!guest || guest.personId === who.personId) return 0;
  return db.tx(async q => {
    const ids = [guest.personId, who.personId];
    await q.query('delete from when_answer m where m.person_id=$2 and m.draft and exists(select 1 from when_answer g where g.poll_id=m.poll_id and g.person_id=$1 and not g.draft)', ids);
    const { rows } = await q.query('update when_answer a set person_id=$2,invite_email=null where a.person_id=$1 and not exists(select 1 from when_answer m where m.poll_id=a.poll_id and m.person_id=$2) returning a.poll_id', ids);
    await q.query(`update when_message m set person_id=$2,attempts=0,state=case when m.state='failed' then 'queued' else m.state end
      where m.person_id=$1 and not exists(select 1 from when_message o where o.poll_id=m.poll_id and o.kind=m.kind and o.person_id=$2)`, ids);
    await q.query('update when_event set person_id=$2 where person_id=$1', ids);
    await q.query('delete from person where id=$1', [guest.personId]);
    return rows.length;
  });
}
