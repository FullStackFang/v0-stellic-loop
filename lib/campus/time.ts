// Times on the campus screen are read and shown in the campus's own timezone, whatever the server's or the viewer's is.
// No 'server-only' here: the screen's client parts format times with these too.

const formats = new Map<string, Intl.DateTimeFormat>();
function format(tz: string) {
  let made = formats.get(tz);
  if (!made) formats.set(tz, made = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }));
  return made;
}

export type LocalParts = { date: string; hour: number; minute: number; weekday: string };

/** The wall-clock date and time of an instant in a timezone. */
export function localParts(tz: string, at: Date): LocalParts & { second: number } {
  const part: Record<string, string> = {};
  for (const { type, value } of format(tz).formatToParts(at)) part[type] = value;
  return { date: `${part.year}-${part.month}-${part.day}`, hour: Number(part.hour), minute: Number(part.minute), second: Number(part.second), weekday: part.weekday };
}

function offset(tz: string, at: number): number {
  const p = localParts(tz, new Date(at)), [year, month, day] = p.date.split('-').map(Number);
  return Date.UTC(year, month - 1, day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000;
}

/** The instant of a wall-clock time ('YYYY-MM-DDTHH:mm') in a timezone. */
export function zoned(tz: string, local: string): Date {
  const wall = Date.parse(`${local.slice(0, 16)}:00Z`);
  if (Number.isNaN(wall)) throw new Error('Not a date and time');
  // Twice, so a time just after a clock change lands on the right side of it.
  const first = wall - offset(tz, wall);
  return new Date(wall - offset(tz, first));
}

/** An instant as a form's local time on the campus's clock: 'YYYY-MM-DDTHH:mm'. */
export function localInput(tz: string, at: Date): string {
  const parts = localParts(tz, at);
  return `${parts.date}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function validTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** 'Today', or the short weekday. */
export function dayLabel(tz: string, at: string | Date, now: Date): string {
  const then = localParts(tz, new Date(at));
  return then.date === localParts(tz, now).date ? 'Today' : then.weekday;
}

/** '3pm', '9:30am'. */
export function timeLabel(tz: string, at: string | Date): string {
  const { hour, minute } = localParts(tz, new Date(at));
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}

/** The Monday that starts the local week of an instant, as 'YYYY-MM-DD'. Weeks are compared by this. */
export function weekOf(tz: string, at: string | Date): string {
  const { date, weekday } = localParts(tz, new Date(at));
  const back = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
  return new Date(Date.parse(`${date}T00:00:00Z`) - back * 86400000).toISOString().slice(0, 10);
}

/** An event with no end time ends two hours after it starts (design D7). */
export const endOf = (startsAt: string, endsAt: string | null) => endsAt ? Date.parse(endsAt) : Date.parse(startsAt) + 2 * 3600000;

/** Checking in works from 30 minutes before the start until the end (design D7). */
export function checkInOpen(startsAt: string, endsAt: string | null, now: Date): boolean {
  return now.getTime() >= Date.parse(startsAt) - 30 * 60000 && now.getTime() <= endOf(startsAt, endsAt);
}
