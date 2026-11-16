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

/** One timed entry of a group's calendar (loop-trip, design D5 and D6): its name, time and place, and nobody's name. */
export type CalendarEntry = {
  /** The same for every version of the entry, so a later version replaces the earlier one. */
  uid: string;
  sequence: number;
  start: Date;
  /** Without an end the entry runs one hour. */
  end: Date | null;
  summary: string;
  location: string | null;
  description: string;
  url: string | null;
};
const entryLines = (e: CalendarEntry, now: Date) => [
  `UID:${e.uid}`,
  `DTSTAMP:${stamp(now)}`,
  `SEQUENCE:${e.sequence}`,
  `DTSTART:${stamp(e.start)}`,
  `DTEND:${stamp(e.end ?? new Date(e.start.getTime() + 3_600_000))}`,
  `SUMMARY:${escapeText(e.summary)}`,
  ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
  `DESCRIPTION:${escapeText(e.description)}`,
  ...(e.url ? [`URL:${e.url}`] : []),
];
const calendar = (method: string, body: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Loop//Groups//EN", "CALSCALE:GREGORIAN", `METHOD:${method}`, ...body, "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
// An address inside a property value: nothing that could end the value or start another line.
const address = (value: string) => value.replace(/[\s;,"<>]/g, "");

/**
 * The calendar file sent to one member: an invite (also used for a change,
 * with a higher sequence) or a cancellation of the same entry. It names the
 * sender and that one member, and no one else.
 */
export function memberInviteIcs(i: { method: "REQUEST" | "CANCEL"; entry: CalendarEntry; organizer: string; attendee: string; now?: Date }): string {
  return calendar(i.method, [
    "BEGIN:VEVENT",
    ...entryLines(i.entry, i.now ?? new Date()),
    `ORGANIZER;CN=Loop:mailto:${address(i.organizer)}`,
    // The member already said they are in: the entry lands as accepted and asks for no reply.
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${address(i.attendee)}`,
    `STATUS:${i.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
  ]);
}
/** A calendar to subscribe to: every entry, and no person at all. */
export function feedIcs(i: { name: string; entries: CalendarEntry[]; now?: Date }): string {
  const now = i.now ?? new Date();
  return calendar("PUBLISH", [`X-WR-CALNAME:${escapeText(i.name)}`, ...i.entries.flatMap(entry => ["BEGIN:VEVENT", ...entryLines(entry, now), "END:VEVENT"])]);
}

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
