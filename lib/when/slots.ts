// Loopd When: the hours of a poll, and when enough people can make one (docs/superpowers/specs/2026-11-22-loopd-when-design.md).
// Nothing here reads the database or the clock. Times are ISO strings in UTC; they are drawn in the poll's own timezone.
import { addDays, windowDays } from '../days';

export type Threshold = 'majority' | 'two_thirds' | 'everyone';
/** The days and hours a poll covers. Dates are YYYY-MM-DD; `hourEnd` is the hour the last slot ends at, 1 to 24. */
export type Frame = { startDate: string; endDate: string; hourStart: number; hourEnd: number; timezone: string; /** False leaves Saturdays and Sundays out of the poll. */ weekends?: boolean; /** How many minutes one square is: 15, 30 or 60. An hour when left out. */ step?: number };
export type Slot = { day: string; hour: number; /** How far into the hour the square starts. */ minute: number; at: string };
export type Answer = { personId: string; slots: string[] };

const HOUR = 3_600_000;

export function validZone(tz: string): boolean {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

const formats = new Map<string, Intl.DateTimeFormat>();
function wall(at: number, tz: string) {
  let format = formats.get(tz);
  if (!format) formats.set(tz, format = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', timeZoneName: 'shortOffset' }));
  const part = Object.fromEntries(format.formatToParts(new Date(at)).map(each => [each.type, each.value]));
  return { day: `${part.year}-${part.month}-${part.day}`, hour: Number(part.hour), minute: Number(part.minute) };
}
/** How far the zone's clock is ahead of UTC at that instant, in milliseconds. */
function offset(at: number, tz: string): number {
  const { day, hour, minute } = wall(at, tz), [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hour, minute) - Math.floor(at / 60_000) * 60_000;
}
/** The instant a day and hour on the zone's clock happen: the earlier one for an hour that happens twice, null for an hour that never does. */
function instantOf(day: string, hour: number, tz: string, minute = 0): number | null {
  const [y, m, d] = day.split('-').map(Number), naive = Date.UTC(y, m - 1, d, hour, minute);
  // The offsets a day before and a day after are the two a clock change on this day can be between.
  const tries = [...new Set([naive - offset(naive - 24 * HOUR, tz), naive - offset(naive + 24 * HOUR, tz)])].sort((a, b) => a - b);
  for (const at of tries) { const seen = wall(at, tz); if (seen.day === day && seen.hour === hour && seen.minute === minute) return at; }
  return null;
}

export const isWeekend = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() % 6 === 0;
/** Every square of every day of the poll, in day then time order: one an hour, or one each half or quarter of an hour. */
export function slotsOf(frame: Frame): Slot[] {
  const slots: Slot[] = [], step = frame.step ?? 60;
  for (const day of windowDays(frame.startDate, frame.endDate)) if (frame.weekends !== false || !isWeekend(day)) for (let hour = frame.hourStart; hour < frame.hourEnd; hour++) for (let minute = 0; minute < 60; minute += step) {
    const at = instantOf(day, hour, frame.timezone, minute);
    if (at !== null) slots.push({ day, hour, minute, at: new Date(at).toISOString() });
  }
  return slots;
}
/** The size of the squares a meeting of that length is painted in: its own length under an hour (a quarter for 45 minutes), else an hour. */
export const stepOf = (duration: number) => duration >= 60 ? 60 : duration % 30 ? 15 : 30;
/**
 * What a person painted, carried from squares of `from` minutes to a plan whose squares, `slots`, are `to` minutes.
 * To smaller squares, every part of a painted one is painted. To bigger ones, a square is painted only when all of it
 * was. Times the plan no longer has are left out.
 */
export function restep(painted: string[], slots: string[], from: number, to: number): string[] {
  const had = new Set(painted.map(at => Date.parse(at))), MIN = 60_000, parts = Array.from({ length: Math.max(from, to) / Math.min(from, to) }, (_, n) => n);
  return slots.filter(at => { const then = Date.parse(at); return to <= from ? parts.some(n => had.has(then - n * to * MIN)) : parts.every(n => had.has(then + n * from * MIN)); });
}

/** How many people it takes. */
export function needed(threshold: Threshold, size: number): number {
  return threshold === 'majority' ? Math.floor(size / 2) + 1 : threshold === 'two_thirds' ? Math.ceil(2 * size / 3) : size;
}
/** The group's size: what the organizer said, or the number who answered when more did. */
export const sizeOf = (expected: number, answered: number) => Math.max(expected, answered);

/** The times most people can make, the most first; among equals the earliest. Times nobody picked are left out. */
export function bestSlots(answers: Answer[], limit = 3): { at: string; people: string[] }[] {
  const by = new Map<string, string[]>();
  for (const answer of answers) for (const at of answer.slots) by.set(at, [...(by.get(at) ?? []), answer.personId]);
  return [...by].map(([at, people]) => ({ at, people })).sort((a, b) => b.people.length - a.people.length || (a.at < b.at ? -1 : 1)).slice(0, limit);
}

/**
 * Whether the organizer should be told. Before the deadline: three people have answered and some time has enough of
 * them. From the deadline on: anyone has answered at all. `met` says whether some time has enough people.
 */
export function readiness(i: { threshold: Threshold; expectedSize: number; answers: Answer[]; deadline: Date; now: Date }): { ready: boolean; met: boolean } {
  const answered = i.answers.filter(answer => answer.slots.length > 0), top = bestSlots(answered, 1)[0]?.people.length ?? 0;
  const met = top > 0 && top >= needed(i.threshold, sizeOf(i.expectedSize, answered.length));
  return { ready: i.now >= i.deadline ? answered.length >= 1 : answered.length >= 3 && met, met };
}

/** The same hour on the zone's clock seven days on, whatever the clocks did in between. */
export function shiftWeek(at: string, tz: string): string {
  const then = Date.parse(at), seen = wall(then, tz);
  return new Date(instantOf(addDays(seen.day, 7), seen.hour, tz) ?? then + 7 * 24 * HOUR).toISOString();
}

export const hourText = (hour: number, minute = 0) => `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour % 24 < 12 ? 'am' : 'pm'}`;
/** The minutes a meeting may start at within its hour, and how long it may run. */
export const START_MINUTES = [0, 15, 30, 45], DURATIONS = [15, 30, 45, 60, 90, 120];
/** "45 min", "1 hr", "1 hr 30": how long a meeting runs. */
export const lengthText = (minutes: number) => minutes < 60 ? `${minutes} min` : minutes % 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60}` : `${minutes / 60} hr`;
/** "7:15 to 8 pm": a start, in minutes after midnight on the poll's clock, and how long it runs. */
export function spanText(start: number, duration: number): string {
  const text = (minutes: number) => hourText(Math.floor(minutes / 60) % 24, minutes % 60), from = text(start), to = text(start + duration);
  return `${from.slice(-2) === to.slice(-2) ? from.slice(0, -3) : from} to ${to}`;
}
/** A time as the poll's people read it. */
export function slotLabel(at: string, tz: string): { day: string; dow: string; dowLong: string; date: number; month: string; time: string; hour: number; minute: number } {
  const then = new Date(at), seen = wall(then.getTime(), tz), word = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...options }).format(then);
  return { day: seen.day, dow: word({ weekday: 'short' }), dowLong: word({ weekday: 'long' }), date: Number(seen.day.slice(8)), month: word({ month: 'short' }), time: hourText(seen.hour, seen.minute), hour: seen.hour, minute: seen.minute };
}
