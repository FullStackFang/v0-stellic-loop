import type { Q } from '../db';

// "15 minutes?" on the Ink page, after signing up (public/demo/mockups-ink-join.html, openspec loop-ink-tiers): a
// student or an organizer says when a short Zoom call would suit them, and the founder writes back. Nothing is booked.

export type CallRole = 'student' | 'organizer';
export type CallAsk = { email: string; role: CallRole; times: string[]; note: string; asked: string };
/** The most days and times one ask may give. */
export const CALL_TIMES = 4;
const TIME = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Keeps one "Send my times": who, their email, student or organizer, the days and times they typed (their own local
 * time) and a note. It needs at least one time or a note. Returns false, and keeps nothing, for anything else.
 */
export async function askForCall(q: Q, personId: string | null, email: string, ask: { role?: unknown; times?: unknown; note?: unknown }): Promise<boolean> {
  const role = ask.role === 'student' || ask.role === 'organizer' ? ask.role : null;
  const times = Array.isArray(ask.times) ? [...new Set(ask.times)] : null, note = typeof ask.note === 'string' ? ask.note.replace(/\s+/g, ' ').trim() : ask.note === undefined ? '' : null;
  if (!role || !times || note === null || note.length > 200 || times.length > CALL_TIMES || !times.every(each => typeof each === 'string' && TIME.test(each)) || (!times.length && !note)) return false;
  await q.query('insert into campus_call_ask(person_id,email,role,times,note) values($1,$2,$3,$4,$5)', [personId, email.trim().toLowerCase().slice(0, 320), role, times, note]);
  return true;
}
/** For the admin: every ask for a call, newest first. */
export const callAsks = async (q: Q) => (await q.query<CallAsk>(`select email,role,times,note,to_char(asked_at,'YYYY-MM-DD HH24:MI') as asked from campus_call_ask order by asked_at desc,id desc limit 500`)).rows;
