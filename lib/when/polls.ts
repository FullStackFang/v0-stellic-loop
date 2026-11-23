import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db, Q } from '../db';
import { isValidDay } from '../days';
import { notify } from './notify';
import { DURATIONS, bestSlots, needed, readiness, sizeOf, slotsOf, validZone, type Frame, type Threshold } from './slots';

// Loopd When: making a poll, answering it, and reading it (docs/superpowers/specs/2026-11-22-loopd-when-design.md).

export class WhenError extends Error {
  constructor(public readonly code: 'invalid' | 'not_found' | 'forbidden' | 'limit' | 'sent' | 'full') { super(code); }
}
/** Who is acting: a signed-in person (a Principal is one), or a guest who answered with only a name (lib/when/guests.ts). */
export type Who = { personId: string };
export type Person = { personId: string; name: string };
export type PollView = {
  id: string; seriesId: string; title: string; frame: Frame; threshold: Threshold; deadline: string; status: 'open' | 'sent';
  /** The organizer has been told that a time works, or that the deadline passed. */
  ready: boolean;
  organizer: Person; isOrganizer: boolean;
  /** The group's size, and how many of it a time needs. */
  size: number; needed: number;
  /** How long the meeting runs, in minutes. */
  minutes: number;
  /** Everyone whose answer counts, in the order they answered. */
  answered: Person[];
  /** How many people can make each time; times nobody picked are absent. */
  counts: Record<string, number>;
  /** Who can make each time, in the order they answered. */
  free: Record<string, Person[]>;
  /** The viewer's own answer. A draft is last week's, carried over and not yet counted. */
  mine: { slots: string[]; draft: boolean } | null;
  best: { at: string; people: Person[] }[];
  /** The time that was set: its start, how many minutes it runs, and who can make the hour it starts in. */
  chosen: { at: string; minutes: number; note: string | null; in: Person[]; out: Person[] } | null;
};

export const POLL_ID = /^[A-Za-z0-9_-]{12}$/;
const PER_DAY = 10, DAY_MS = 86_400_000;
export const iso = (column: string) => `to_char(${column} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const instant = z.string().max(40).refine(value => !Number.isNaN(Date.parse(value))).transform(value => new Date(value).toISOString());
const whole = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const NewPoll = z.object({
  title: z.string().transform(value => value.replace(/\s+/g, ' ').trim()).pipe(z.string().min(1).max(80)),
  startDate: z.string().refine(isValidDay), endDate: z.string().refine(isValidDay),
  hourStart: whole(0, 23), hourEnd: whole(1, 24), timezone: z.string().max(64).refine(validZone),
  expectedSize: whole(2, 200), deadline: instant, threshold: z.enum(['majority', 'two_thirds', 'everyone']),
  weekends: z.union([z.boolean(), z.enum(['0', '1']).transform(value => value === '1')]).default(true),
  duration: z.coerce.number().refine(value => DURATIONS.includes(value)).default(60),
});
/** A change to a poll. Its clock stays the one it was made on. */
const EditPoll = NewPoll.omit({ timezone: true }).extend({ pollId: z.string().regex(/^[A-Za-z0-9_-]{12}$/) });
/** Whether a plan makes sense: at most two weeks of days, hours in order, a deadline within sixty days, and at least one hour to offer. */
function sound(plan: Frame & { deadline: string }, now: Date): boolean {
  const days = (Date.parse(plan.endDate) - Date.parse(plan.startDate)) / DAY_MS, until = Date.parse(plan.deadline) - now.getTime();
  return days >= 0 && days <= 13 && plan.hourEnd > plan.hourStart && until > 0 && until <= 60 * DAY_MS && slotsOf(plan).length > 0;
}
const NewAnswer = z.object({ pollId: z.string().regex(POLL_ID), slots: z.array(instant).max(336) });
export function read<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new WhenError('invalid');
  return parsed.data;
}

export async function logEvent(q: Q, kind: string, poll: { id: string; seriesId: string }, o: { personId?: string; visitor?: string } = {}): Promise<void> {
  await q.query('insert into when_event(kind,poll_id,series_id,person_id,visitor) values($1,$2,$3,$4,$5)', [kind, poll.id, poll.seriesId, o.personId ?? null, o.visitor ?? null]);
}

/** Makes a poll and returns its id, which is its address. A person makes at most ten a day. */
export async function createPoll(db: Db, who: Who, input: unknown, now = new Date()): Promise<{ id: string }> {
  const poll = read(NewPoll, input);
  if (!sound(poll, now)) throw new WhenError('invalid');
  return db.tx(async q => {
    const { rows: [made] } = await q.query<{ n: number }>('select count(*)::int as n from when_poll where organizer_id=$1 and created_at>$2', [who.personId, new Date(now.getTime() - DAY_MS).toISOString()]);
    if (made.n >= PER_DAY) throw new WhenError('limit');
    const id = randomBytes(9).toString('base64url');
    await q.query(`insert into when_poll(id,series_id,organizer_id,title,start_date,end_date,hour_start,hour_end,timezone,expected_size,deadline,threshold,created_at,weekends,duration_min) values($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, who.personId, poll.title, poll.startDate, poll.endDate, poll.hourStart, poll.hourEnd, poll.timezone, poll.expectedSize, poll.deadline, poll.threshold, now.toISOString(), poll.weekends, poll.duration]);
    await logEvent(q, 'poll_created', { id, seriesId: id }, { personId: who.personId });
    return { id };
  });
}

export type PollRow = { id: string; seriesId: string; organizerId: string; organizerName: string; title: string; startDate: string; endDate: string; hourStart: number; hourEnd: number; timezone: string;
  expectedSize: number; deadline: string; threshold: Threshold; status: 'open' | 'sent'; readyAt: string | null; chosenSlot: string | null; note: string | null; weekends: boolean; durationMin: number };
const POLL = `select w.id,w.series_id as "seriesId",w.organizer_id as "organizerId",o.name as "organizerName",w.title,w.start_date as "startDate",w.end_date as "endDate",w.hour_start as "hourStart",w.hour_end as "hourEnd",w.timezone,
  w.expected_size as "expectedSize",${iso('w.deadline')} as deadline,w.threshold,w.status,${iso('w.ready_at')} as "readyAt",${iso('w.chosen_slot')} as "chosenSlot",w.note,w.weekends,w.duration_min as "durationMin" from when_poll w join person o on o.id=w.organizer_id where w.id=$1`;
/** The poll's row; `lock` holds it for the rest of the transaction, so two writers take turns. */
export async function pollRow(q: Q, id: string, lock = false): Promise<PollRow | null> {
  return (await q.query<PollRow>(POLL + (lock ? ' for update of w' : ''), [id])).rows[0] ?? null;
}
export const frameOf = (poll: PollRow): Frame => ({ startDate: poll.startDate, endDate: poll.endDate, hourStart: poll.hourStart, hourEnd: poll.hourEnd, timezone: poll.timezone, weekends: poll.weekends });

export type AnswerRow = Person & { slots: string[]; draft: boolean };
/** Every answer to a poll, drafts too, in the order they were last saved. */
export async function answersOf(q: Q, pollId: string): Promise<AnswerRow[]> {
  return (await q.query<AnswerRow>(`select a.person_id as "personId",p.name,a.draft,array(select ${iso('s')} from unnest(a.slots) s order by s) as slots
    from when_answer a join person p on p.id=a.person_id where a.poll_id=$1 order by a.updated_at,a.person_id`, [pollId])).rows;
}

/**
 * Tells the organizer, once, that the poll is ready for them: enough people can make one time, or the deadline has
 * passed with an answer in. The caller holds the poll's row. Returns whether this call was the one that did it.
 */
export async function markReady(q: Q, poll: PollRow, now: Date): Promise<boolean> {
  if (poll.status !== 'open' || poll.readyAt) return false;
  const answers = (await answersOf(q, poll.id)).filter(answer => !answer.draft);
  const { ready, met } = readiness({ threshold: poll.threshold, expectedSize: poll.expectedSize, answers, deadline: new Date(poll.deadline), now });
  if (!ready) return false;
  await q.query('update when_poll set ready_at=$2,ready_met=$3 where id=$1', [poll.id, now.toISOString(), met]);
  await notify(q, poll.id, poll.organizerId, 'ready', now);
  await logEvent(q, 'poll_ready', poll);
  return true;
}

/**
 * Keeps a person's hours for a poll, in place of what they said before. Every hour must be one the poll has. It is
 * taken after the invite has gone too: that moves the person between who is in and who is not, never the time.
 */
export async function saveAnswer(db: Db, who: Who, input: unknown, now = new Date()): Promise<{ ready: boolean }> {
  const answer = read(NewAnswer, input);
  return db.tx(async q => {
    const poll = await pollRow(q, answer.pollId, true);
    if (!poll) throw new WhenError('not_found');
    const has = new Set(slotsOf(frameOf(poll)).map(slot => slot.at));
    if (new Set(answer.slots).size !== answer.slots.length || answer.slots.some(at => !has.has(at))) throw new WhenError('invalid');
    await q.query(`insert into when_answer(poll_id,person_id,slots,draft,updated_at) values($1,$2,$3::timestamptz[],false,$4)
      on conflict(poll_id,person_id) do update set slots=excluded.slots,draft=false,updated_at=excluded.updated_at`, [poll.id, who.personId, answer.slots, now.toISOString()]);
    await logEvent(q, 'response_saved', poll, { personId: who.personId });
    return { ready: await markReady(q, poll, now) };
  });
}

/**
 * Changes an open poll's plan. Only its organizer may, and only until the time is set. Its address stays the same.
 * Hours people painted that the new plan no longer has are dropped from their answers; the rest are kept.
 */
export async function updatePoll(db: Db, who: Who, input: unknown, now = new Date()): Promise<void> {
  const next = read(EditPoll, input);
  await db.tx(async q => {
    const poll = await pollRow(q, next.pollId, true);
    if (!poll) throw new WhenError('not_found');
    if (poll.organizerId !== who.personId) throw new WhenError('forbidden');
    if (poll.status !== 'open') throw new WhenError('sent');
    const plan = { ...next, timezone: poll.timezone };
    if (!sound(plan, now)) throw new WhenError('invalid');
    await q.query('update when_poll set title=$2,start_date=$3,end_date=$4,hour_start=$5,hour_end=$6,expected_size=$7,deadline=$8,threshold=$9,weekends=$10,duration_min=$11 where id=$1',
      [poll.id, next.title, next.startDate, next.endDate, next.hourStart, next.hourEnd, next.expectedSize, next.deadline, next.threshold, next.weekends, next.duration]);
    const has = slotsOf(plan).map(slot => slot.at);
    await q.query('update when_answer a set slots=array(select s from unnest(a.slots) s where s=any($2::timestamptz[]) order by s) where a.poll_id=$1 and not a.slots <@ $2::timestamptz[]', [poll.id, has]);
    await markReady(q, (await pollRow(q, poll.id))!, now);
  });
}

/** A poll as its line in "Your polls" shows it. */
export type PollLine = { id: string; title: string; status: 'open' | 'sent'; ready: boolean; isOrganizer: boolean; organizerName: string; startDate: string; endDate: string; timezone: string;
  deadline: string; chosenSlot: string | null; durationMin: number; /** How many have answered, and the group's size. */ answered: number; size: number; /** The viewer's own answer counts. */ mine: boolean };
/** The polls a person made or has an answer in, the newest first. */
export async function myPolls(q: Q, who: Who): Promise<PollLine[]> {
  return (await q.query<PollLine>(`select w.id,w.title,w.status,w.ready_at is not null as ready,w.organizer_id=$1 as "isOrganizer",o.name as "organizerName",w.start_date as "startDate",w.end_date as "endDate",w.timezone,
    ${iso('w.deadline')} as deadline,${iso('w.chosen_slot')} as "chosenSlot",w.duration_min as "durationMin",n.answered,greatest(w.expected_size,n.answered) as size,
    exists(select 1 from when_answer a where a.poll_id=w.id and a.person_id=$1 and not a.draft) as mine
    from when_poll w join person o on o.id=w.organizer_id, lateral (select count(*)::int as answered from when_answer a where a.poll_id=w.id and not a.draft) n
    where w.organizer_id=$1 or exists(select 1 from when_answer a where a.poll_id=w.id and a.person_id=$1) order by w.created_at desc,w.id limit 40`, [who.personId])).rows;
}

/** A poll as one viewer sees it, or null when there is no such poll. Anyone with the address may read it. */
export async function pollView(db: Db, who: Who | null, id: string): Promise<PollView | null> {
  if (!POLL_ID.test(id)) return null;
  const poll = await pollRow(db, id);
  if (!poll) return null;
  const all = await answersOf(db, id), counted = all.filter(answer => !answer.draft), own = who && all.find(answer => answer.personId === who.personId);
  const person = (each: Person): Person => ({ personId: each.personId, name: each.name }), named = new Map(counted.map(each => [each.personId, person(each)]));
  const counts: Record<string, number> = {};
  const free: Record<string, Person[]> = {};
  for (const answer of counted) for (const at of answer.slots) { counts[at] = (counts[at] ?? 0) + 1; (free[at] ??= []).push(person(answer)); }
  const size = sizeOf(poll.expectedSize, counted.length);
  // A meeting may start a quarter of an hour or more into its hour; the people who can make it are those who painted that hour.
  const set = poll.chosenSlot ? Date.parse(poll.chosenSlot) : null, hour = set === null ? null : slotsOf(frameOf(poll)).map(slot => slot.at).filter(at => Date.parse(at) <= set).pop() ?? poll.chosenSlot!;
  return {
    id: poll.id, seriesId: poll.seriesId, title: poll.title, frame: frameOf(poll), threshold: poll.threshold, deadline: poll.deadline, status: poll.status, ready: poll.readyAt !== null,
    organizer: { personId: poll.organizerId, name: poll.organizerName }, isOrganizer: who?.personId === poll.organizerId,
    size, needed: needed(poll.threshold, size), minutes: poll.durationMin, answered: counted.map(person), counts, free,
    mine: own ? { slots: own.slots, draft: own.draft } : null,
    best: bestSlots(counted).map(slot => ({ at: slot.at, people: slot.people.map(id => named.get(id)!) })),
    chosen: poll.chosenSlot ? { at: poll.chosenSlot, minutes: poll.durationMin, note: poll.note, in: counted.filter(each => each.slots.includes(hour!)).map(person), out: counted.filter(each => !each.slots.includes(hour!)).map(person) } : null,
  };
}

/** Notes that a browser opened a poll: once per poll and browser, however often it comes back. */
export async function recordOpen(db: Db, pollId: string, visitor: string): Promise<void> {
  if (!POLL_ID.test(pollId) || !/^[0-9a-f]{32}$/.test(visitor)) return;
  await db.query(`insert into when_event(kind,poll_id,series_id,visitor) select 'poll_opened',id,series_id,$2 from when_poll where id=$1 on conflict(poll_id,visitor) where kind='poll_opened' do nothing`, [pollId, visitor]);
}
