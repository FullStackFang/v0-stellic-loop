// Calendar days as 'YYYY-MM-DD' strings. Window arithmetic is done on UTC
// midnights, so DST never shifts a day; "today" is resolved in the board's
// timezone with Intl.

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

/** "Tuesday 16" */
export function longLabel(day: string): string {
  return `${dowLong(day)} ${dayNum(day)}`;
}

/** "Feb 14–20" (or "Feb 28–Mar 3") */
export function windowLabel(start: string, end: string): string {
  return mon(start) === mon(end)
    ? `${mon(start)} ${dayNum(start)}–${dayNum(end)}`
    : `${mon(start)} ${dayNum(start)}–${mon(end)} ${dayNum(end)}`;
}
