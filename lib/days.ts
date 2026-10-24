// Calendar days as 'YYYY-MM-DD' strings. Window arithmetic is done on UTC
// midnights, so DST never shifts a day; "today" is resolved in the board's
// timezone with Intl. A board's window comes only from here: nothing else
// reads its stored dates.
import type { Board } from "./types";

/** A rolling board's window length. 0005_boards.sql repeats it as `today + 13`. */
export const ROLLING_DAYS = 14;

export type WindowBoard = Pick<Board, "window_kind" | "window_start" | "window_end">;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utc(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** Every day from start to end inclusive. */
export function windowDays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Today's date in `tz` at instant `now`. */
export function todayIn(tz: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** True once the whole of `day` has passed in `tz`. */
export function isPastEndOf(day: string, tz: string, now: Date = new Date()): boolean {
  return todayIn(tz, now) > day;
}

export function isValidDay(day: unknown): day is string {
  return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && iso(utc(day)) === day;
}

/** "Sun" */
export function dow(day: string): string {
  return DOW[utc(day).getUTCDay()];
}

/** "Tuesday" */
export function dowLong(day: string): string {
  return DOW_LONG[utc(day).getUTCDay()];
}

/** 14 */
export function dayNum(day: string): number {
  return utc(day).getUTCDate();
}

/** "Feb" */
export function mon(day: string): string {
  return MON[utc(day).getUTCMonth()];
}

/** "Sun 14" */
export function shortLabel(day: string): string {
  return `${dow(day)} ${dayNum(day)}`;
}

/** "Mon Tue", or "Mon 26 Mon 2" when a weekday repeats (a two-week window). */
export function dayNames(days: string[]): string[] {
  const names = days.map(dow);
  return new Set(names).size < names.length ? days.map(shortLabel) : names;
}

/** "Tuesday 16" */
export function longLabel(day: string): string {
  return `${dowLong(day)} ${dayNum(day)}`;
}

/** "Feb 14–20" (or "Feb 28–Mar 3") */
export function rangeLabel(start: string, end: string): string {
  return mon(start) === mon(end)
    ? `${mon(start)} ${dayNum(start)}–${dayNum(end)}`
    : `${mon(start)} ${dayNum(start)}–${mon(end)} ${dayNum(end)}`;
}

/** The board's window on `today` (in the board's timezone): its dates, or today plus 13 days. */
export function windowOf(board: WindowBoard, today: string): { start: string; end: string } {
  if (board.window_kind === "rolling") return { start: today, end: addDays(today, ROLLING_DAYS - 1) };
  return { start: board.window_start!, end: board.window_end! };
}

/** Every window day, past ones included (strips show them struck through). */
export function windowDaysOf(board: WindowBoard, today: string): string[] {
  const w = windowOf(board, today);
  return windowDays(w.start, w.end);
}

/** The window days that count: today or later. */
export function countedDays(board: WindowBoard, today: string): string[] {
  return windowDaysOf(board, today).filter((d) => d >= today);
}

/** The last day of a fixed window; a rolling board has none. */
export function fixedEnd(board: WindowBoard): string | null {
  return board.window_kind === "fixed" ? board.window_end : null;
}

/** True once a fixed board's dates are all past. A rolling window is never over. */
export function isWindowOver(board: WindowBoard, today: string): boolean {
  const end = fixedEnd(board);
  return end !== null && today > end;
}

/** The window's name in the header and hero: "Feb 14–20", or "Next two weeks". */
export function windowLabel(board: WindowBoard): string {
  return board.window_kind === "rolling" ? "Next two weeks" : rangeLabel(board.window_start!, board.window_end!);
}

/** The dates over a strip, so a row crossing a month reads right: "Nov 23 – Dec 6". */
export function stripLabel(board: WindowBoard, today: string): string {
  const { start, end } = windowOf(board, today);
  return mon(start) === mon(end)
    ? `${mon(start)} ${dayNum(start)} – ${dayNum(end)}`
    : `${mon(start)} ${dayNum(start)} – ${mon(end)} ${dayNum(end)}`;
}
