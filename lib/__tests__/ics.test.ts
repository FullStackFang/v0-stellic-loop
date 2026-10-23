import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { fold, inviteIcs } from "../ics";

const base = {
  id: "8f9b2c1e-0000-4000-8000-000000000001",
  title: "Suits in Hoi An",
  day: "2027-02-16",
  timeText: "3:00pm",
  costText: "~$250",
  url: "https://board.test/p/8f9b2c1e-0000-4000-8000-000000000001",
  now: new Date("2027-01-10T12:00:00Z"),
};

/** RFC 5545 shape checks ical.js is too lenient to make. */
function strict(ics: string) {
  expect(ics.endsWith("\r\n")).toBe(true);
  expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  for (const line of ics.split("\r\n").filter(Boolean)) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  const unfolded = ics.replace(/\r\n /g, "");
  const lines = unfolded.split("\r\n").filter(Boolean);
  expect(lines[0]).toBe("BEGIN:VCALENDAR");
  expect(lines.at(-1)).toBe("END:VCALENDAR");
  for (const req of ["VERSION:2.0", "PRODID:", "METHOD:PUBLISH", "UID:", "DTSTAMP:"]) {
    expect(lines.some((l) => l.startsWith(req))).toBe(true);
  }
  expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
  return lines;
}

describe("ics", () => {
  it("is one all-day event on the locked day", () => {
    const ics = inviteIcs(base);
    const lines = strict(ics);
    expect(lines).toContain("DTSTART;VALUE=DATE:20270216");
    expect(lines).toContain("DTEND;VALUE=DATE:20270217");
    expect(lines).toContain(`UID:${base.id}`);

    const comp = new ICAL.Component(ICAL.parse(ics));
    const ev = new ICAL.Event(comp.getFirstSubcomponent("vevent")!);
    expect(ev.summary).toBe("Suits in Hoi An");
    expect(ev.startDate.isDate).toBe(true);
    expect(ev.startDate.toString()).toBe("2027-02-16");
    expect(ev.description).toContain("3:00pm");
    expect(ev.description).toContain("~$250");
    expect(ev.description).toContain(base.url);
  });

  it("escapes text and folds long lines at 75 octets without splitting characters", () => {
    const title = "Dinner, drinks; and \\ more — ".repeat(6) + "phở";
    const ics = inviteIcs({ ...base, title });
    strict(ics);
    const ev = new ICAL.Event(new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent("vevent")!);
    expect(ev.summary).toBe(title);
  });

  it("fold keeps short lines intact", () => {
    expect(fold("SUMMARY:x")).toBe("SUMMARY:x");
    const long = "X".repeat(200);
    expect(fold(long).split("\r\n ").join("")).toBe(long);
  });
});
