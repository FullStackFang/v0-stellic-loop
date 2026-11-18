import { localParts } from './time';

// Posting in one line (openspec loop-group-event-links, design D12): "dumplings tonight 7 @collegetown". The line is
// read the same way in the browser, to show the person what was understood as they type, and on the server, which is
// what counts. No 'server-only' here for that reason.

export type LineRead = {
  /** What it is: the line without its time, its @place and its link. */
  title: string;
  /** The start on the campus's clock ('YYYY-MM-DDTHH:mm'), or null when the line names no time. */
  starts: string | null;
  /** The @place, without the @, in lower case. */
  tag: string | null;
  /** A link found in the line, as typed. */
  link: string | null;
};

export const TAG = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/;
/** The @place being typed at the end of the line, for suggestions: '' right after the @, null when there is none. */
export const typingTag = (text: string): string | null => /(?:^|\s)@([a-z0-9-]{0,30})$/i.exec(text)?.[1].toLowerCase() ?? null;

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY = '(tonight|today|tomorrow|tmrw|(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday)?)';
const CLOCK = '(\\d{1,2})(?::([0-5]\\d))?\\s*(am|pm)?';
const LINK = /(?:^|\s)((?:https?:\/\/|(?:lu\.ma|luma\.com|posh\.vip|www\.eventbrite\.com)\/)\S+)/i;
/** Words that are a time by themselves. Said after an @ they are still a time, never a place. */
export const TIME_WORDS = ['tonight', 'morning', 'afternoon', 'evening', 'noon'];
const PART: Record<string, [number, string]> = { morning: [9, 'am'], afternoon: [3, 'pm'], evening: [7, 'pm'] };
const two = (n: number) => String(n).padStart(2, '0');
const plusDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** Reads a typed line. Pure: the same text, timezone and moment always give the same answer. */
export function readLine(text: string, tz: string, now: Date): LineRead {
  let rest = ` ${text.replace(/\s+/g, ' ').trim()} `;
  const take = (pattern: RegExp) => { const found = pattern.exec(rest); if (found) rest = `${rest.slice(0, found.index)} ${rest.slice(found.index + found[0].length)}`; return found; };
  const link = take(LINK)?.[1] ?? null;
  // People reach for @ for the time too ("@evening", "@7pm", "@sat"): that is a time, not a place.
  rest = rest.replace(new RegExp(` @(?=(?:${DAY}|morning|afternoon|evening|noon|\\d{1,2}(?::[0-5]\\d)?\\s*(?:am|pm)|\\d{1,2}:[0-5]\\d) )`, 'gi'), ' ');
  const tagged = take(/ @([a-z0-9][a-z0-9-]{0,29})(?= )/i)?.[1].toLowerCase().replace(/-+$/, '') ?? null, tag = tagged && TAG.test(tagged) ? tagged : null;
  take(/ @ /);

  // A clock time needs a sign that it is one: am or pm, a colon, "at" before it, or a day word beside it. "5K" and "2110" are not times.
  let day: string | null = null, hour: number | null = null, minute = 0, meridiem: string | null = null;
  const clock = (found: RegExpExecArray | null, at: number) => { if (found) { hour = Number(found[at]); minute = Number(found[at + 1] ?? 0); meridiem = found[at + 2]?.toLowerCase() ?? null; } return found; };
  const beside = take(new RegExp(` ${DAY}(?: at)? ${CLOCK}(?= )`, 'i'));
  if (beside) { day = beside[1]; clock(beside, 2); }
  else {
    const before = take(new RegExp(` (?:at )?${CLOCK} ${DAY}(?= )`, 'i'));
    if (before) { clock(before, 1); day = before[4]; }
    else {
      day = take(new RegExp(` ${DAY}(?= )`, 'i'))?.[1] ?? null;
      if (take(/ (?:at )?noon(?= )/i)) { hour = 12; meridiem = 'pm'; }
      else clock(take(/ (?:at )?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)(?= )/i) ?? take(/ (?:at )?(\d{1,2}):([0-5]\d)()(?= )/i) ?? take(/ at (\d{1,2})()()(?= )/i), 1);
    }
  }
  // A part of the day stands for an hour when no hour was said: "this evening", "tomorrow morning".
  if (hour === null) { const part = take(/ (?:(?:this|in the) )?(morning|afternoon|evening)(?= )/i); if (part) [hour, meridiem] = PART[part[1].toLowerCase()]; }
  day = day?.toLowerCase() ?? null;
  const today = localParts(tz, now), nowMinutes = today.hour * 60 + today.minute;
  let starts: string | null = null;
  if (hour === null && day === 'tonight') { hour = 7; meridiem = 'pm'; }
  if (hour !== null && hour <= 23 && !(meridiem && (hour < 1 || hour > 12))) {
    let h: number = hour;
    if (meridiem) h = h % 12 + (meridiem === 'pm' ? 12 : 0);
    // With no am or pm: 1 to 7 is the afternoon or evening, and so is anything said with "tonight".
    else if (h >= 1 && h <= 11 && (h < 8 || day === 'tonight')) h += 12;
    const minutes = h * 60 + minute;
    let ahead = 0;
    if (day === 'tomorrow' || day === 'tmrw') ahead = 1;
    else if (day && day !== 'today' && day !== 'tonight') { ahead = (DAYS.indexOf(day.slice(0, 3)) - DAYS.indexOf(today.weekday.toLowerCase()) + 7) % 7; if (ahead === 0 && minutes <= nowMinutes) ahead = 7; }
    else if (!day && minutes <= nowMinutes) ahead = 1;
    starts = `${plusDays(today.date, ahead)}T${two(h)}:${two(minute)}`;
  }
  const title = rest.replace(/\s+/g, ' ').trim().replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '');
  return { title: title ? title[0].toUpperCase() + title.slice(1) : '', starts, tag, link };
}

/**
 * Times to offer when a line has none, each as the words to add and the start they would give. Only times still
 * ahead, each start once, and on the day the line names when it names one ("movie sat" is offered Saturday's hours).
 */
export function whenIdeas(text: string, tz: string, now: Date): { add: string; starts: string }[] {
  if (readLine(text, tz, now).starts) return [];
  const today = localParts(tz, now), nowAt = `${today.date}T${two(today.hour)}:${two(today.minute)}`, ideas: { add: string; starts: string }[] = [];
  const named = new RegExp(`(?:^|[\\s@])${DAY}(?=\\s|$)`, 'i').test(text);
  for (const add of named ? ['9am', 'noon', '7pm'] : ['tonight', '9am', 'noon', '7pm', 'tomorrow 7pm', 'sat 10am']) {
    const starts = readLine(`${text} ${add}`, tz, now).starts;
    if (starts && starts > nowAt && !ideas.some(idea => idea.starts === starts)) ideas.push({ add, starts });
  }
  return ideas.slice(0, 4);
}
