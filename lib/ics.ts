// One all-day VEVENT for an ON proposal with a day (RFC 5545).
import { addDays } from "./days";

export type InviteInput = {
  id: string;
  title: string;
  day: string;
  timeText: string | null;
  costText: string | null;
  url: string;
  now?: Date;
};

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold a content line at 75 octets, never splitting a UTF-8 sequence. */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // continuation lines start with one space
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const compact = (day: string) => day.replace(/-/g, "");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function inviteIcs(i: InviteInput): string {
  const desc = [i.timeText && `Time: ${i.timeText}`, i.costText && `Cost: ${i.costText}`, i.url].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Quorum//Board//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${i.id}`,
    `DTSTAMP:${stamp(i.now ?? new Date())}`,
    `DTSTART;VALUE=DATE:${compact(i.day)}`,
    `DTEND;VALUE=DATE:${compact(addDays(i.day, 1))}`,
    `SUMMARY:${escapeText(i.title)}`,
    `DESCRIPTION:${escapeText(desc)}`,
    `URL:${i.url}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
