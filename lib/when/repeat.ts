import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { addDays } from '../days';
import { POLL_ID, WhenError, frameOf, iso, logEvent, pollRow, pollView, read, type Person, type PollView, type Who } from './polls';
import { shiftWeek, slotLabel, slotsOf, type Frame } from './slots';

// Loopd When: asking the same group again. A poll and the ones made from it are a series; its people are everyone who
// has asked or answered in it. The next poll is the last one a week on, with each person's usual times filled in as a
// draft: shown to them painted, counted only once they save.

const HOUR = 3_600_000;
const Repeat = z.object({ pollId: z.string().regex(POLL_ID) });

async function seriesPeople(q: Q, seriesId: string): Promise<Person[]> {
  return (await q.query<Person>(`select p.id as "personId",p.name from person p where p.id in (
    select a.person_id from when_answer a join when_poll w on w.id=a.poll_id where w.series_id=$1 and not a.draft
    union select w.organizer_id from when_poll w where w.series_id=$1) order by p.name,p.id`, [seriesId])).rows;
}
/** Each person's latest answer that counted, anywhere in the series. */
async function lastAnswers(q: Q, seriesId: string): Promise<{ personId: string; slots: string[] }[]> {
  return (await q.query<{ personId: string; slots: string[] }>(`select distinct on (a.person_id) a.person_id as "personId",array(select ${iso('s')} from unnest(a.slots) s order by s) as slots
    from when_answer a join when_poll w on w.id=a.poll_id where w.series_id=$1 and not a.draft order by a.person_id,w.created_at desc,w.id`, [seriesId])).rows;
}
/** The weekday and hour of a time on the poll's clock: what "the same time" means from one week to another, whatever the clocks did. */
const usualKey = (at: string, zone: string) => { const label = slotLabel(at, zone); return `${label.dow} ${label.time}`; };

/** A person's times as they would say them: "Tue 7 to 9 pm" for hours that touch, "Mon 7 pm" for one alone. */
export function usualLabels(slots: string[], zone: string): string[] {
  const sorted = [...slots].sort(), out: string[] = [];
  for (let at = 0; at < sorted.length;) {
    let end = at;
    while (end + 1 < sorted.length && Date.parse(sorted[end + 1]) - Date.parse(sorted[end]) === HOUR && slotLabel(sorted[end + 1], zone).day === slotLabel(sorted[at], zone).day) end++;
    const from = slotLabel(sorted[at], zone), to = slotLabel(new Date(Date.parse(sorted[end]) + HOUR).toISOString(), zone).time;
    out.push(end === at ? `${from.dow} ${from.time}` : `${from.dow} ${from.time.slice(-2) === to.slice(-2) ? from.time.slice(0, -3) : from.time} to ${to}`);
    at = end + 1;
  }
  return out;
}

export type SeriesView = { poll: PollView; people: Person[]; usual: string[]; next: Frame; past: { id: string; at: string; in: Person[]; size: number }[] };
/** What the "again" screen shows, or null for someone who is not one of the series' people, or a poll that is not there. */
export async function seriesView(db: Db, who: Who, pollId: string): Promise<SeriesView | null> {
  const poll = await pollView(db, who, pollId);
  if (!poll) return null;
  const people = await seriesPeople(db, poll.seriesId);
  if (!people.some(each => each.personId === who.personId)) return null;
  const named = new Map(people.map(each => [each.personId, each]));
  const { rows } = await db.query<{ id: string; at: string; size: number; in: string[] }>(`select w.id,${iso('w.chosen_slot')} as at,
    greatest(w.expected_size,(select count(*)::int from when_answer a where a.poll_id=w.id and not a.draft)) as size,
    array(select a.person_id::text from when_answer a where a.poll_id=w.id and not a.draft and w.chosen_slot=any(a.slots) order by a.updated_at,a.person_id) as "in"
    from when_poll w where w.series_id=$1 and w.status='sent' order by w.chosen_slot desc limit 6`, [poll.seriesId]);
  const mine = (await lastAnswers(db, poll.seriesId)).find(each => each.personId === who.personId);
  return { poll, people, usual: usualLabels(mine?.slots ?? [], poll.frame.timezone), next: { ...poll.frame, startDate: addDays(poll.frame.startDate, 7), endDate: addDays(poll.frame.endDate, 7) },
    past: rows.map(row => ({ id: row.id, at: row.at, size: row.size, in: row.in.flatMap(id => named.get(id) ?? []) })) };
}

/**
 * Makes the next poll of a series from a sent one: the same plan a week on, whoever asks as its organizer. Pressed
 * twice, or by two people, it makes one poll and both get it.
 */
export async function repeatPoll(db: Db, who: Who, input: unknown, now = new Date()): Promise<{ id: string }> {
  const { pollId } = read(Repeat, input);
  return db.tx(async q => {
    const poll = await pollRow(q, pollId, true);
    if (!poll) throw new WhenError('not_found');
    const people = await seriesPeople(q, poll.seriesId);
    if (!people.some(each => each.personId === who.personId)) throw new WhenError('forbidden');
    if (poll.status !== 'sent') throw new WhenError('invalid');
    const { rows: [made] } = await q.query<{ id: string }>('select id from when_poll where previous_poll_id=$1 order by created_at limit 1', [poll.id]);
    if (made) return { id: made.id };
    const frame: Frame = { ...frameOf(poll), startDate: addDays(poll.startDate, 7), endDate: addDays(poll.endDate, 7) }, slots = slotsOf(frame);
    // The deadline a week on; if that has gone, a day before the first hour; if that has gone too, there is nothing to ask.
    let deadline = shiftWeek(poll.deadline, poll.timezone);
    if (Date.parse(deadline) <= now.getTime()) deadline = slots.length ? new Date(Date.parse(slots[0].at) - 24 * HOUR).toISOString() : deadline;
    if (Date.parse(deadline) <= now.getTime()) throw new WhenError('invalid');
    const id = randomBytes(9).toString('base64url');
    await q.query(`insert into when_poll(id,series_id,previous_poll_id,organizer_id,title,start_date,end_date,hour_start,hour_end,timezone,expected_size,deadline,threshold,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, poll.seriesId, poll.id, who.personId, poll.title, frame.startDate, frame.endDate, frame.hourStart, frame.hourEnd, frame.timezone, Math.max(2, people.length), deadline, poll.threshold, now.toISOString()]);
    for (const answer of await lastAnswers(q, poll.seriesId)) {
      const usual = new Set(answer.slots.map(at => usualKey(at, poll.timezone))), carried = slots.filter(slot => usual.has(usualKey(slot.at, poll.timezone))).map(slot => slot.at);
      if (carried.length) await q.query('insert into when_answer(poll_id,person_id,slots,draft,updated_at) values($1,$2,$3::timestamptz[],true,$4)', [id, answer.personId, carried, now.toISOString()]);
    }
    await logEvent(q, 'repeat_created', { id, seriesId: poll.seriesId }, { personId: who.personId });
    return { id };
  });
}
