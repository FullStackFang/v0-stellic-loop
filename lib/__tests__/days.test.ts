import { describe, expect, it } from "vitest";
import { addDays, isPastEndOf, isValidDay, longLabel, shortLabel, todayIn, windowDays, windowLabel } from "../days";

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
    expect(windowLabel("2027-02-27", "2027-03-02")).toBe("Feb 27–Mar 2");
    expect(windowLabel("2027-02-14", "2027-02-20")).toBe("Feb 14–20");
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
