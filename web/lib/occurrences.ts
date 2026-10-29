/**
 * Weekly occurrences derived from a loop's slot.
 *
 * Every start is computed from the slot's local wall time in the campus
 * IANA zone (never by adding 7 x 24 h), so the DST change keeps 7:00 PM
 * at 7:00 PM local on both sides of it. Pure functions; no I/O.
 */

export interface Slot {
  /** ISO weekday: 1 = Monday ... 7 = Sunday (matches Postgres `extract(isodow)` and `loop.weekday`) */
  weekday: number;
  /** Local start time, 'HH:MM' (24-hour) */
  startLocal: string;
  durationMin: number;
  /** IANA zone, e.g. 'America/New_York' */
  tz: string;
}

export interface OccurrenceLike {
  id: string;
  startsAt: Date;
  cancelled: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

/** The wall-clock time that `instant` shows on a clock in `tz`. */
function wallTimeAt(instant: Date, tz: string): WallTime {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const p of formatterFor(tz).formatToParts(instant)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** `wall` read as if it were UTC: a convenient scalar for offset arithmetic. */
function wallAsUtcMs(wall: WallTime): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
}

/** Offset of `tz` from UTC at `instantMs`, in ms (positive east of UTC). */
function offsetAt(instantMs: number, tz: string): number {
  return wallAsUtcMs(wallTimeAt(new Date(instantMs), tz)) - instantMs;
}

/**
 * The UTC instant at which a clock in `tz` shows `wall`.
 *
 * DST handling: candidates are built from every offset in effect within a
 * day of the wall time and tried in ascending instant order; the first one
 * that formats back to the requested wall time wins. In the autumn overlap
 * (the hour that happens twice) that is the earlier, pre-transition instant.
 * In the spring gap (the hour that never happens) nothing formats back, so
 * we keep the pre-transition offset, which lands one hour later on the
 * clock (02:30 -> 03:30), the way most calendar apps roll a skipped time.
 */
export function instantForWallTime(wall: WallTime, tz: string): Date {
  const naive = wallAsUtcMs(wall);
  const offsets = new Set<number>();
  for (const probe of [naive - DAY_MS, naive, naive + DAY_MS]) {
    offsets.add(offsetAt(probe, tz));
  }
  const candidates = [...offsets].map((off) => naive - off).sort((a, b) => a - b);
  for (const ms of candidates) {
    if (wallAsUtcMs(wallTimeAt(new Date(ms), tz)) === naive) return new Date(ms);
  }
  // Gap: a larger offset came into effect, so the pre-transition (smaller)
  // offset gives the latest candidate.
  return new Date(candidates[candidates.length - 1]);
}

/** ISO weekday of a wall date (1 = Monday ... 7 = Sunday). */
function weekdayOf(wall: WallTime): number {
  const js = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** Same wall time, `days` calendar days later (pure date arithmetic). */
function addDays(wall: WallTime, days: number): WallTime {
  const d = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days));
  return {
    ...wall,
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function parseStartLocal(startLocal: string): { hour: number; minute: number } {
  // Accepts 'HH:MM' and the 'HH:MM:SS' that Postgres `time` columns serialize to.
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(startLocal);
  const hour = m ? Number(m[1]) : NaN;
  const minute = m ? Number(m[2]) : NaN;
  if (!m || hour > 23 || minute > 59) {
    throw new Error(`Invalid slot startLocal '${startLocal}', expected 'HH:MM' or 'HH:MM:SS'`);
  }
  return { hour, minute };
}

function assertSlot(slot: Slot): void {
  if (!Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7) {
    throw new Error(`Invalid slot weekday ${slot.weekday}, expected ISO 1-7`);
  }
  if (!slot.tz) throw new Error("Slot tz is required");
}

/**
 * The next `count` occurrence starts of `slot`, strictly after `from`, each at
 * the slot's local wall time in `slot.tz`. An occurrence whose start is at or
 * before `from` is skipped.
 */
export function nextWeeklyStarts(slot: Slot, from: Date, count: number): Date[] {
  assertSlot(slot);
  const { hour, minute } = parseStartLocal(slot.startLocal);
  if (!Number.isInteger(count)) throw new Error(`count must be an integer, got ${count}`);
  if (count <= 0) return [];

  // First candidate: the slot's weekday on or after `from`'s local date.
  const today = wallTimeAt(from, slot.tz);
  const ahead = (slot.weekday - weekdayOf(today) + 7) % 7;
  let wall = addDays({ ...today, hour, minute }, ahead);
  if (instantForWallTime(wall, slot.tz).getTime() <= from.getTime()) {
    wall = addDays(wall, 7);
  }

  const starts: Date[] = [];
  for (let i = 0; i < count; i++) {
    starts.push(instantForWallTime(wall, slot.tz));
    wall = addDays(wall, 7);
  }
  return starts;
}

/**
 * Starts among the next `horizonWeeks` occurrences (default 4) that are not
 * already in `existing`, compared by instant. Running this on its own output
 * returns nothing, which keeps the daily top-up idempotent.
 *
 * `existing` MUST be every occurrence row of the loop, cancelled ones
 * included; passing only non-cancelled rows would regenerate a cancelled week
 * and collide with `unique(loop_id, starts_at)`.
 */
export function missingStarts(
  slot: Slot,
  now: Date,
  existing: Date[],
  horizonWeeks = 4,
): Date[] {
  const have = new Set(existing.map((d) => d.getTime()));
  return nextWeeklyStarts(slot, now, horizonWeeks).filter((d) => !have.has(d.getTime()));
}

/**
 * The next occurrence: the earliest non-cancelled one whose start plus
 * duration is after `now`, so during the meeting it is still today's.
 * Returns null when there is none.
 */
export function pickNextOccurrence<T extends OccurrenceLike>(
  occurrences: T[],
  durationMin: number,
  now: Date,
): T | null {
  let best: T | null = null;
  for (const occ of occurrences) {
    if (occ.cancelled) continue;
    if (occ.startsAt.getTime() + durationMin * MINUTE_MS <= now.getTime()) continue;
    if (!best || occ.startsAt.getTime() < best.startsAt.getTime()) best = occ;
  }
  return best;
}
