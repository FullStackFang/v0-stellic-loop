import { describe, expect, it } from "vitest";
import {
  addDays, countedDays, isPastEndOf, isValidDay, isWindowOver, longLabel, rangeLabel, ROLLING_DAYS, shortLabel, stripLabel,
  todayIn, windowDays, windowDaysOf, windowLabel, windowOf,
} from "../days";

const TRIP = { window_kind: "fixed" as const, window_start: "2027-02-14", window_end: "2027-02-20" };
const ROLLING = { window_kind: "rolling" as const, window_start: null, window_end: null };
const NY = "America/New_York";

describe("board windows", () => {
  it("a fixed window is its dates, whenever it is read", () => {
    expect(windowOf(TRIP, "2026-11-03")).toEqual({ start: "2027-02-14", end: "2027-02-20" });
    expect(windowDaysOf(TRIP, "2026-11-03")).toHaveLength(7);
    expect(windowLabel(TRIP)).toBe("Feb 14–20");
  });

  it("a rolling window is today and the next 13 days, moving at local midnight", () => {
    // 23:30 Tue Nov 3 in New York, then 00:10 Wed Nov 4
    const late = todayIn(NY, new Date("2026-11-04T04:30:00Z"));
    const after = todayIn(NY, new Date("2026-11-04T05:10:00Z"));
    expect(windowOf(ROLLING, late)).toEqual({ start: "2026-11-03", end: "2026-11-16" });
    expect(windowOf(ROLLING, after)).toEqual({ start: "2026-11-04", end: "2026-11-17" });
    expect(windowDaysOf(ROLLING, late)).toHaveLength(ROLLING_DAYS);
    expect(windowLabel(ROLLING)).toBe("Next two weeks");
  });

  it("spans the 2026 clock change as 14 calendar days, Nov 1 once", () => {
    const today = todayIn(NY, new Date("2026-10-25T16:00:00Z"));
    const days = windowDaysOf(ROLLING, today);
    expect(days[0]).toBe("2026-10-25");
    expect(days.at(-1)).toBe("2026-11-07");
    expect(new Set(days).size).toBe(14);
    expect(days.filter((d) => d === "2026-11-01")).toHaveLength(1);
  });

  it("mid-trip, only today and later count", () => {
    expect(countedDays(TRIP, "2027-02-17")).toEqual(["2027-02-17", "2027-02-18", "2027-02-19", "2027-02-20"]);
    expect(windowDaysOf(TRIP, "2027-02-17")).toHaveLength(7);
    expect(countedDays(TRIP, "2027-03-01")).toEqual([]);
  });

  it("only a fixed window can be over", () => {
    expect(isWindowOver(TRIP, "2027-02-20")).toBe(false);
    expect(isWindowOver(TRIP, "2027-02-21")).toBe(true);
    expect(isWindowOver(ROLLING, "2099-01-01")).toBe(false);
  });

  it("labels a strip with its dates, across a month", () => {
    expect(stripLabel(ROLLING, "2026-11-23")).toBe("Nov 23 – Dec 6");
    expect(stripLabel(TRIP, "2026-11-23")).toBe("Feb 14 – 20");
  });
});

describe("days", () => {
  it("lists the window inclusive", () => {
    expect(windowDays("2027-02-14", "2027-02-20")).toEqual([
      "2027-02-14", "2027-02-15", "2027-02-16", "2027-02-17", "2027-02-18", "2027-02-19", "2027-02-20",
    ]);
  });

  it("crosses the US spring-forward week without losing or doubling a day", () => {
    // DST starts 2027-03-14 in America/New_York
    const w = windowDays("2027-03-12", "2027-03-16");
    expect(w).toEqual(["2027-03-12", "2027-03-13", "2027-03-14", "2027-03-15", "2027-03-16"]);
    expect(addDays("2027-03-13", 1)).toBe("2027-03-14");
    expect(addDays("2027-03-14", 1)).toBe("2027-03-15");
  });

  it("crosses month and year ends", () => {
    expect(windowDays("2026-12-30", "2027-01-02")).toHaveLength(4);
    expect(rangeLabel("2027-02-27", "2027-03-02")).toBe("Feb 27–Mar 2");
    expect(rangeLabel("2027-02-14", "2027-02-20")).toBe("Feb 14–20");
  });

  it("resolves today in the board's timezone around midnight", () => {
    // 04:59 UTC on Feb 17 is 23:59 Feb 16 in New York
    const before = new Date("2027-02-17T04:59:00Z");
    const after = new Date("2027-02-17T05:00:00Z");
    expect(todayIn("America/New_York", before)).toBe("2027-02-16");
    expect(todayIn("America/New_York", after)).toBe("2027-02-17");
    expect(todayIn("Asia/Ho_Chi_Minh", before)).toBe("2027-02-17");
  });

  it("treats a day as past only after its end in the board's timezone", () => {
    expect(isPastEndOf("2027-02-16", "America/New_York", new Date("2027-02-17T04:59:00Z"))).toBe(false);
    expect(isPastEndOf("2027-02-16", "America/New_York", new Date("2027-02-17T05:00:00Z"))).toBe(true);
  });

  it("handles the DST change at midnight boundaries", () => {
    // After spring-forward New York is UTC-4: midnight Mar 15 = 04:00Z
    expect(todayIn("America/New_York", new Date("2027-03-15T03:59:00Z"))).toBe("2027-03-14");
    expect(todayIn("America/New_York", new Date("2027-03-15T04:00:00Z"))).toBe("2027-03-15");
  });

  it("labels days", () => {
    expect(shortLabel("2027-02-14")).toBe("Sun 14");
    expect(longLabel("2027-02-16")).toBe("Tuesday 16");
  });

  it("validates day strings", () => {
    expect(isValidDay("2027-02-14")).toBe(true);
    expect(isValidDay("2027-02-30")).toBe(false);
    expect(isValidDay("Feb 14")).toBe(false);
  });
});
