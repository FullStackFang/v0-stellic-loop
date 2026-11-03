import { isValidDay } from "./days";

export const RHYTHMS = { once: "Just once", weekly: "Weekly", fortnightly: "Every other week" } as const;
export type Intent = { rhythm: keyof typeof RHYTHMS; preferences: string[] };
export type IntentDraft = { title: string; day: string; time: string; place: string; intent: Intent };
export const emptyIntent = (): Intent => ({ rhythm: "once", preferences: [] });
const clean = (s: string) => s.trim().replace(/\s+/g, " ");

/** Treat all action inputs as untrusted, including pending OTP payloads. */
export function validateIntent(input: unknown): Intent | null {
  if (input === undefined) return emptyIntent();
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { rhythm, preferences } = input as Record<string, unknown>;
  if (typeof rhythm !== "string" || !Object.hasOwn(RHYTHMS, rhythm) || !Array.isArray(preferences) || preferences.length > 12) return null;
  const values: string[] = [];
  for (const p of preferences) {
    if (typeof p !== "string" || !clean(p) || clean(p).length > 60) return null;
    const value = clean(p);
    if (!values.some(v => v.toLowerCase() === value.toLowerCase())) values.push(value);
  }
  return { rhythm: rhythm as Intent["rhythm"], preferences: values };
}

const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function resolveDay(value: string, days: string[]): string | null {
  const key = value.toLowerCase().replace(/s$/, "");
  const weekday = weekdays.findIndex(d => d === key || d.slice(0, 3) === key);
  if (weekday >= 0) return days.find(d => new Date(`${d}T12:00:00Z`).getUTCDay() === weekday) ?? null;
  return isValidDay(value) && days.includes(value) ? value : null;
}

/** Pins start at a word boundary. Their values run until another pin or newline. */
export function parseIntent(raw: string, days: string[]): IntentDraft & { errors: string[] } {
  const result = { title: "", day: "", time: "", place: "", intent: emptyIntent(), errors: [] as string[] };
  if (raw.length > 1200) result.errors.push("Keep your intent under 1,200 characters.");
  const used = new Set<string>();
  const once = (key: string) => {
    if (used.has(key)) { result.errors.push(`Use just one ${key} pin.`); return false; }
    used.add(key); return true;
  };
  const prose = raw.replace(/(?<!\S)@([^\n]*?)(?=\s@|\n|$)/g, (_, text: string) => {
    const space = "";
    const value = clean(text);
    if (!value) return space;
    const typed = value.match(/^(day|time|place|preference):\s*(.*)$/i);
    if (typed && typed[1].toLowerCase() !== "preference") {
      const kind = typed[1].toLowerCase() as "day" | "time" | "place";
      if (!once(kind)) return space;
      if (kind === "day") {
        if (/^any day$/i.test(typed[2])) result.day = "";
        else { const date = resolveDay(typed[2], days); if (date) result.day = date; else result.errors.push("Choose a day in this space’s date window."); }
      } else {
        result[kind] = clean(typed[2]);
        if (!result[kind] || result[kind].length > (kind === "time" ? 40 : 200)) result.errors.push(`Keep the ${kind} pin between 1 and ${kind === "time" ? 40 : 200} characters.`);
      }
    } else if (/^(weekly|every other week|fortnightly|once|just once)$/i.test(value)) {
      if (once("rhythm")) result.intent.rhythm = /weekly/i.test(value) ? "weekly" : /other|fortnight/i.test(value) ? "fortnightly" : "once";
    } else {
      const preference = typed ? clean(typed[2]) : value;
      if (!preference || preference.length > 60) result.errors.push("Keep each preference between 1 and 60 characters.");
      if (!result.intent.preferences.some(p => p.toLowerCase() === preference.toLowerCase())) result.intent.preferences.push(preference);
    }
    return space;
  });
  result.title = clean(prose);
  // Only a trailing weekday is inferred, and only when there is an eligible date.
  const trailing = result.title.match(/\s+(?:on\s+)?(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)s?$/i);
  if (trailing && !used.has("day")) {
    const date = resolveDay(trailing[1], days);
    if (date) { result.day = date; result.title = result.title.slice(0, trailing.index).trim(); }
  }
  if (!result.title) result.errors.push("Say what you’re up for.");
  else if (result.title.length > 80) result.errors.push("Keep the activity under 80 characters. Use @ pins for preferences.");
  if (result.intent.preferences.length > 12) result.errors.push("Use up to 12 preferences.");
  return result;
}

/** Explicit syntax avoids reinterpreting edited custom preferences as slots. */
export function serializeIntent(draft: IntentDraft): string {
  const parts = [draft.title];
  // Only emit an explicit open day when it prevents the activity being reinterpreted.
  if (draft.day) parts.push(`@day:${draft.day}`);
  else if (/\s(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)s?$/i.test(draft.title)) parts.push("@day:any day");
  if (draft.time) parts.push(`@time:${draft.time}`);
  if (draft.place) parts.push(`@place:${draft.place}`);
  if (draft.intent.rhythm !== "once") parts.push(`@${RHYTHMS[draft.intent.rhythm].toLowerCase()}`);
  parts.push(...draft.intent.preferences.map(p => /^(?:(?:day|time|place|preference):|(?:weekly|every other week|fortnightly|once|just once)$)/i.test(p) ? `@preference:${p}` : `@${p}`));
  return parts.join(" ");
}
