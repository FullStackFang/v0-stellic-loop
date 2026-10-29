import { describe, expect, it } from "vitest";
import {
  missingStarts,
  nextWeeklyStarts,
  pickNextOccurrence,
  type Slot,
} from "@/lib/occurrences";

const NY = "America/New_York";
const thursday7pm: Slot = { weekday: 4, startLocal: "19:00", durationMin: 90, tz: NY };

function localClock(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

describe("nextWeeklyStarts", () => {
  it("gives the next four Thursdays at 7:00 PM local across the Nov 1 2026 DST change", () => {
    const from = new Date("2026-10-17T12:00:00Z"); // Saturday Oct 17
    const starts = nextWeeklyStarts(thursday7pm, from, 4);

    expect(starts.map((d) => localClock(d, NY))).toEqual([
      "Thu, Oct 22, 19:00",
      "Thu, Oct 29, 19:00",
      "Thu, Nov 5, 19:00",
      "Thu, Nov 12, 19:00",
    ]);
    // EDT before Nov 1 (19:00 = 23:00Z), EST after (19:00 = 00:00Z next day).
    expect(starts.map((d) => d.toISOString())).toEqual([
      "2026-10-22T23:00:00.000Z",
      "2026-10-29T23:00:00.000Z",
      "2026-11-06T00:00:00.000Z",
      "2026-11-13T00:00:00.000Z",
    ]);
  });

  it("skips an occurrence that starts at or before from", () => {
    const atStart = new Date("2026-10-22T23:00:00Z");
    expect(nextWeeklyStarts(thursday7pm, atStart, 1)[0].toISOString()).toBe(
      "2026-10-29T23:00:00.000Z",
    );
    const justBefore = new Date("2026-10-22T22:59:59Z");
    expect(nextWeeklyStarts(thursday7pm, justBefore, 1)[0].toISOString()).toBe(
      "2026-10-22T23:00:00.000Z",
    );
  });

  it("accepts the HH:MM:SS form that a Postgres time column serializes to", () => {
    const a = nextWeeklyStarts(thursday7pm, new Date("2026-10-17T12:00:00Z"), 1);
    const b = nextWeeklyStarts({ ...thursday7pm, startLocal: "19:00:00" }, new Date("2026-10-17T12:00:00Z"), 1);
    expect(b.map((d) => d.toISOString())).toEqual(a.map((d) => d.toISOString()));
  });

  it("rejects a non-integer count", () => {
    expect(() => nextWeeklyStarts(thursday7pm, new Date(), 2.5)).toThrow();
  });

  it("rejects a malformed slot", () => {
    expect(() => nextWeeklyStarts({ ...thursday7pm, startLocal: "7pm" }, new Date(), 1)).toThrow();
    expect(() => nextWeeklyStarts({ ...thursday7pm, weekday: 0 }, new Date(), 1)).toThrow();
    expect(() => nextWeeklyStarts({ ...thursday7pm, weekday: 8 }, new Date(), 1)).toThrow();
  });
});

describe("ISO weekday", () => {
  it("treats 7 as Sunday and 1 as Monday", () => {
    const from = new Date("2026-10-17T12:00:00Z"); // Saturday
    const sun = nextWeeklyStarts({ ...thursday7pm, weekday: 7 }, from, 1)[0];
    const mon = nextWeeklyStarts({ ...thursday7pm, weekday: 1 }, from, 1)[0];
    expect(sun.toISOString()).toBe("2026-10-18T23:00:00.000Z");
    expect(mon.toISOString()).toBe("2026-10-19T23:00:00.000Z");
  });
});

describe("missingStarts", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const four = nextWeeklyStarts(thursday7pm, now, 4);

  it("returns exactly the one missing start when three of four exist", () => {
    const missing = missingStarts(thursday7pm, now, four.slice(0, 3));
    expect(missing.map((d) => d.toISOString())).toEqual(["2026-11-13T00:00:00.000Z"]);
  });

  it("returns nothing when all four exist", () => {
    expect(missingStarts(thursday7pm, now, four)).toEqual([]);
  });

  it("adds exactly the fifth once the first has passed, then nothing (daily cron state)", () => {
    const later = new Date("2026-10-23T06:00:00Z");
    expect(missingStarts(thursday7pm, later, four).map((d) => d.toISOString())).toEqual([
      "2026-11-20T00:00:00.000Z",
    ]);
    expect(missingStarts(thursday7pm, later, [...four, new Date("2026-11-20T00:00:00Z")])).toEqual([]);
  });

  it("compares by instant, not by object identity", () => {
    const copies = four.map((d) => new Date(d.getTime()));
    expect(missingStarts(thursday7pm, now, copies)).toEqual([]);
  });
});

describe("pickNextOccurrence", () => {
  const occurrences = [
    { id: "oct22", startsAt: new Date("2026-10-22T23:00:00Z"), cancelled: false },
    { id: "oct29", startsAt: new Date("2026-10-29T23:00:00Z"), cancelled: false },
  ];

  it("returns today's occurrence at 7:30 PM during a 7:00-8:30 meeting", () => {
    const now = new Date("2026-10-22T23:30:00Z");
    expect(pickNextOccurrence(occurrences, 90, now)?.id).toBe("oct22");
  });

  it("returns next week's once the meeting has ended", () => {
    const atEnd = new Date("2026-10-23T00:30:00Z"); // exactly 8:30 PM
    expect(pickNextOccurrence(occurrences, 90, atEnd)?.id).toBe("oct29");
    const after = new Date("2026-10-23T00:45:00Z");
    expect(pickNextOccurrence(occurrences, 90, after)?.id).toBe("oct29");
  });

  it("skips a cancelled occurrence (Nov 26 cancelled -> Dec 3)", () => {
    const thanksgiving = [
      { id: "nov19", startsAt: new Date("2026-11-20T00:00:00Z"), cancelled: false },
      { id: "nov26", startsAt: new Date("2026-11-27T00:00:00Z"), cancelled: true },
      { id: "dec3", startsAt: new Date("2026-12-04T00:00:00Z"), cancelled: false },
    ];
    const now = new Date("2026-11-21T12:00:00Z");
    expect(pickNextOccurrence(thanksgiving, 90, now)?.id).toBe("dec3");
  });

  it("does not depend on input order", () => {
    const now = new Date("2026-10-22T23:30:00Z");
    expect(pickNextOccurrence([...occurrences].reverse(), 90, now)?.id).toBe("oct22");
  });

  it("returns null when nothing is upcoming", () => {
    expect(pickNextOccurrence(occurrences, 90, new Date("2026-12-01T00:00:00Z"))).toBeNull();
    expect(pickNextOccurrence([], 90, new Date())).toBeNull();
  });
});
