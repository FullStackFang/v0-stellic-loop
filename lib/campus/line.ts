import { localParts } from './time';

// Posting in one line (openspec loop-group-event-links, design D12): "dumplings tonight 7 @collegetown". The line is
// read the same way in the browser, to show the person what was understood as they type, and on the server, which is
// what counts. No 'server-only' here for that reason.

export type LineRead = {
  /** What it is: the line without its time, its @tags and its link. */
  title: string;
  /** The start on the campus's clock ('YYYY-MM-DDTHH:mm'), or null when the line names no time. */
  starts: string | null;
  /** The day it is on ('YYYY-MM-DD', campus clock): the start's day, else the day or date the line names, else today. */
  day: string;
  /** The first of `tags`, or null. */
  tag: string | null;
  /** The @tags in the order typed, without the @, in lower case: a place, an activity, an event (openspec loop-campus-tags). */
  tags: string[];
  /** A link found in the line, as typed. */
  link: string | null;
};

export const TAG = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/;
/** How many tags a plan carries. One more in a line stays in the title as written. */
export const MOST_TAGS = 4;
/** The @tag being typed at the end of the line, for suggestions: '' right after the @, null when there is none. */
export const typingTag = (text: string): string | null => /(?:^|\s)@([a-z0-9-]{0,30})$/i.exec(text)?.[1].toLowerCase() ?? null;

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY = '(tonight|today|tomorrow|tmrw|(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday)?)';
const CLOCK = '(\\d{1,2})(?::([0-5]\\d))?\\s*(am|pm)?';
const LINK = /(?:^|\s)((?:https?:\/\/|(?:lu\.ma|luma\.com|posh\.vip|www\.eventbrite\.com)\/)\S+)/i;
/** Words that are a time by themselves. Said after an @ they are still a time, never a place. */
export const TIME_WORDS = ['tonight', 'morning', 'afternoon', 'evening', 'noon'];
const PART: Record<string, [number, string]> = { morning: [9, 'am'], afternoon: [3, 'pm'], evening: [7, 'pm'] };
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const two = (n: number) => String(n).padStart(2, '0');
const plusDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** Reads a typed line. Pure: the same text, timezone and moment always give the same answer. */
export function readLine(text: string, tz: string, now: Date): LineRead {
  const { title, starts, day, tag, tags, link } = scan(text, tz, now);
  return { title, starts, day, tag, tags, link };
}
/**
 * Reads a line that is due, not held: "upload your W8 by friday @emba-council" (openspec loop-on-you). Its time is the one it
 * says, or else the end of the day it names; null when it names neither. A "by" left where the day stood is dropped.
 */
export function readDue(text: string, tz: string, now: Date): { title: string; due: string | null; tags: string[] } {
  const said = scan(text, tz, now), read = said.starts || !said.named ? said : scan(`${text} 11:59pm`, tz, now);
  const title = said.title.replace(/^(?:by|before|due|until)\s+|\s+(?:by|before|due|until)$/gi, '').trim();
  return { title: title ? title[0].toUpperCase() + title.slice(1) : '', due: read.starts, tags: said.tags };
}
/** The reading, and whether the line names a day or a date (with or without an hour). */
function scan(text: string, tz: string, now: Date): LineRead & { named: boolean } {
  let rest = ` ${text.replace(/\s+/g, ' ').trim()} `;
  const take = (pattern: RegExp) => { const found = pattern.exec(rest); if (found) rest = `${rest.slice(0, found.index)} ${rest.slice(found.index + found[0].length)}`; return found; };
  const link = take(LINK)?.[1] ?? null;
  // People reach for @ for the time too ("@evening", "@7pm", "@sat"): that is a time, not a place.
  rest = rest.replace(new RegExp(` @(?=(?:${DAY}|morning|afternoon|evening|noon|\\d{1,2}(?::[0-5]\\d)?\\s*(?:am|pm)|\\d{1,2}:[0-5]\\d) )`, 'gi'), ' ');
  // Each @word is a tag, with the small word before it dropped. Past the fourth, one stays in the title as written.
  const tags: string[] = [];
  rest = rest.replace(/ (?:(?:in|at|on) )?@([a-z0-9][a-z0-9-]{0,29})(?= )/gi, (all, word: string) => {
    const slug = word.toLowerCase().replace(/-+$/, ''), fresh = TAG.test(slug) && !tags.includes(slug);
    if (fresh && tags.length >= MOST_TAGS) return all;
    if (fresh) tags.push(slug);
    return ' ';
  });
  const tag = tags[0] ?? null;
  take(/ @ /);

  // A clock time needs a sign that it is one: am or pm, a colon, "at" before it, or a day word beside it. "5K" and "2110" are not times.
  const today = localParts(tz, now);
  // A calendar date: "12/12", "11/21/26", "dec 5", "the 22nd of november". Taken only when it is a real day of a real month.
  let date: string | null = null;
  const dated = (pattern: RegExp, month: (found: RegExpExecArray) => number, dayAt: number, yearAt = 0) => {
    const found = date ? null : pattern.exec(rest);
    if (!found) return;
    const m = month(found), d = Number(found[dayAt]), said = yearAt && found[yearAt] ? Number(found[yearAt]) : null;
    let y = said === null ? Number(today.date.slice(0, 4)) : said < 100 ? 2000 + said : said;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate())) return;
    // With no year said, a date that has passed is next year's.
    if (said === null && `${y}-${two(m)}-${two(d)}` < today.date) y += 1;
    date = `${y}-${two(m)}-${two(d)}`; take(pattern);
  };
  const monthOf = (word: string) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;
  dated(/ (?:on )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?=[ ,])/, found => Number(found[1]), 2, 3);
  dated(new RegExp(` (?:on )?${MONTH}\\.? (\\d{1,2})(?:st|nd|rd|th)?(?=[ ,])`, 'i'), found => monthOf(found[1]), 2);
  dated(new RegExp(` (?:on )?(?:the )?(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MONTH}(?=[ ,])`, 'i'), found => monthOf(found[2]), 1);

  let day: string | null = null, hour: number | null = null, minute = 0, meridiem: string | null = null;
  const clock = (found: RegExpExecArray | null, at: number) => { if (found) { hour = Number(found[at]); minute = Number(found[at + 1] ?? 0); meridiem = found[at + 2]?.toLowerCase() ?? null; } return found; };
  const beside = take(new RegExp(` (?:on )?${DAY}(?: at)? ${CLOCK}(?= )`, 'i'));
  if (beside) { day = beside[1]; clock(beside, 2); }
  else {
    const before = take(new RegExp(` (?:at )?${CLOCK} ${DAY}(?= )`, 'i'));
    if (before) { clock(before, 1); day = before[4]; }
    else {
      day = take(new RegExp(` (?:on )?${DAY}(?= )`, 'i'))?.[1] ?? null;
      if (take(/ (?:at )?noon(?= )/i)) { hour = 12; meridiem = 'pm'; }
      else clock(take(/ (?:at )?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)(?= )/i) ?? take(/ (?:at )?(\d{1,2}):([0-5]\d)()(?= )/i) ?? take(/ at (\d{1,2})()()(?= )/i), 1);
    }
  }
  // A part of the day stands for an hour when no hour was said: "this evening", "tomorrow morning".
  if (hour === null) { const part = take(/ (?:(?:this|in the) )?(morning|afternoon|evening)(?= )/i); if (part) [hour, meridiem] = PART[part[1].toLowerCase()]; }
  day = day?.toLowerCase() ?? null;
  const nowMinutes = today.hour * 60 + today.minute, named = !!(date || day);
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
    // A calendar date says the day outright; a day word beside it changes nothing.
    starts = `${date ?? plusDays(today.date, ahead)}T${two(h)}:${two(minute)}`;
  }
  // A day said with no hour (openspec campus-plan-place-and-time, design D2): a weekday is the next one, today included.
  const on = starts?.slice(0, 10) ?? date ?? (day === 'tomorrow' || day === 'tmrw' ? plusDays(today.date, 1)
    : day && day !== 'today' && day !== 'tonight' ? plusDays(today.date, (DAYS.indexOf(day.slice(0, 3)) - DAYS.indexOf(today.weekday.toLowerCase()) + 7) % 7) : today.date);
  const title = rest.replace(/\s+/g, ' ').trim().replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '');
  return { title: title ? title[0].toUpperCase() + title.slice(1) : '', starts, day: on, tag, tags, link, named };
}

/** The times "When works?" offers on a plan's day (design D6), as 'HH:mm'. */
export const TIMES = ['07:00', '09:00', '12:00', '17:00', '19:00'];
/** Of `TIMES`, those still on offer for a plan on `day`: all of them on a later day, today only those 30 minutes or more ahead. */
export function offeredTimes(day: string, tz: string, now: Date): string[] {
  const today = localParts(tz, now);
  if (day > today.date) return [...TIMES];
  if (day < today.date) return [];
  const soonest = today.hour * 60 + today.minute + 30;
  return TIMES.filter(at => Number(at.slice(0, 2)) * 60 + Number(at.slice(3)) >= soonest);
}
/** "7am", "12pm", "5:30pm" for an 'HH:mm'. */
export function clockLabel(at: string): string {
  const h = Number(at.slice(0, 2)), m = at.slice(3, 5);
  return `${h % 12 || 12}${m === '00' ? '' : `:${m}`}${h < 12 ? 'am' : 'pm'}`;
}

/**
 * Times to offer when a line has none, each as the words to add and the start they would give. Only times still
 * ahead, each start once, and on the day the line names when it names one ("movie sat" is offered Saturday's hours).
 */
export function whenIdeas(text: string, tz: string, now: Date): { add: string; starts: string }[] {
  const line = scan(text, tz, now);
  if (line.starts) return [];
  const today = localParts(tz, now), nowAt = `${today.date}T${two(today.hour)}:${two(today.minute)}`, ideas: { add: string; starts: string }[] = [];
  for (const add of line.named ? ['9am', 'noon', '7pm'] : ['tonight', '9am', 'noon', '7pm', 'tomorrow 7pm', 'sat 10am']) {
    const starts = readLine(`${text} ${add}`, tz, now).starts;
    if (starts && starts > nowAt && !ideas.some(idea => idea.starts === starts)) ideas.push({ add, starts });
  }
  return ideas.slice(0, 4);
}
