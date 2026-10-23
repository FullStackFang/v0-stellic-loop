import { describe, expect, it } from "vitest";
import {
  best, conflictFor, conflictsFor, DEFAULT_MIN, heat, idledAt, minOf, remaining, sortBoard, stateOf,
} from "../quorum";
import { BOARD, crowd, D, NOW, prop, resp } from "./fixtures";

const heatOf = (cells: { day: string; count: number }[]) => Object.fromEntries(cells.filter((c) => c.count).map((c) => [c.day, c.count]));

describe("minimum", () => {
  it("is the poster's number or four", () => {
    expect(minOf(prop())).toBe(DEFAULT_MIN);
    expect(minOf(prop({ min_count: 8 }))).toBe(8);
  });
});

describe("heat and best day", () => {
  it("counts only in answers, per day, never who", () => {
    const p = prop();
    const rs = [resp(p.id, "a", "in", [D.tue]), resp(p.id, "b", "in", [D.tue, D.wed]), resp(p.id, "c", "in", [D.wed]), resp(p.id, "d", "maybe", [D.mon])];
    expect(heatOf(heat(BOARD, rs))).toEqual({ [D.tue]: 2, [D.wed]: 2 });
  });

  it("ready by overlap: Mon 3, Tue 4, Wed 4 → ready, best Tue", () => {
    const p = prop();
    const rs = [
      ...crowd(p, 3, [D.mon, D.tue, D.wed], "a"),
      resp(p.id, "b", "in", [D.tue, D.wed]),
    ];
    const cells = heat(BOARD, rs);
    expect(heatOf(cells)).toEqual({ [D.mon]: 3, [D.tue]: 4, [D.wed]: 4 });
    expect(best(cells)).toEqual({ day: D.tue, count: 4 });
    expect(stateOf(p, BOARD, rs, undefined, NOW)).toBe("ready");
  });

  it("has no best day when nobody has days", () => {
    expect(best(heat(BOARD, [resp("p", "a", "in", [])]))).toBeNull();
  });

  it("ignores days outside the window", () => {
    expect(heatOf(heat(BOARD, [resp("p", "a", "in", ["2027-03-01"])]))).toEqual({});
  });
});

describe("readiness", () => {
  it("ready by count for a no-day proposal with no number at 4 in", () => {
    const p = prop({ needs_day: false });
    expect(stateOf(p, BOARD, crowd(p, 4, []), undefined, NOW)).toBe("ready");
    expect(stateOf(p, BOARD, crowd(p, 3, []), undefined, NOW)).toBe("open");
  });

  it("maybes do not lift a proposal: 3 in + 5 maybe of 4 is not ready", () => {
    const p = prop({ needs_day: false });
    const rs = [...crowd(p, 3, []), ...Array.from({ length: 5 }, (_, i) => resp(p.id, `m${i}`, "maybe"))];
    expect(stateOf(p, BOARD, rs, undefined, NOW)).toBe("open");
    expect(remaining(p, BOARD, rs)).toBe(1);
  });

  it("ON is a latch: stays on below the minimum", () => {
    const p = prop({ status: "on", on_day: D.thu, on_at: "2027-01-09T00:00:00Z", min_count: 8 });
    expect(stateOf(p, BOARD, crowd(p, 7, [D.thu]), undefined, NOW)).toBe("on");
  });

  it("an ON proposal with a day is past after that day", () => {
    const p = prop({ status: "on", on_day: D.thu, on_at: "x" });
    expect(stateOf(p, BOARD, [], undefined, new Date("2027-02-19T12:00:00Z"))).toBe("past");
  });

  it("closed is its own state", () => {
    expect(stateOf(prop({ status: "closed" }), BOARD, [], undefined, NOW)).toBe("closed");
  });
});

describe("idling", () => {
  it("deadline, else window end for needs-a-day, else never", () => {
    expect(idledAt(prop({ deadline: "2027-02-01" }), BOARD)).toBe("2027-02-01");
    expect(idledAt(prop(), BOARD)).toBe(BOARD.window_end);
    expect(idledAt(prop({ needs_day: false }), BOARD)).toBeNull();
  });

  it("idles at the end of the window: Boat with 3 of 6", () => {
    const p = prop({ min_count: 6 });
    const rs = crowd(p, 3, [D.tue]);
    expect(stateOf(p, BOARD, rs, undefined, new Date("2027-02-21T04:59:00Z"))).toBe("open");
    expect(stateOf(p, BOARD, rs, undefined, new Date("2027-02-21T05:00:00Z"))).toBe("idled");
  });

  it("open forever: no day and no deadline never idles", () => {
    const p = prop({ needs_day: false });
    expect(stateOf(p, BOARD, [], undefined, new Date("2030-01-01T00:00:00Z"))).toBe("open");
  });

  it("a deadline idles at its end in the board's timezone", () => {
    const p = prop({ needs_day: false, deadline: "2027-01-31" });
    expect(stateOf(p, BOARD, [], undefined, new Date("2027-02-01T04:00:00Z"))).toBe("open");
    expect(stateOf(p, BOARD, [], undefined, new Date("2027-02-01T05:00:00Z"))).toBe("idled");
  });
});

describe("conflict days", () => {
  const suits = prop({ title: "Suits in Hoi An", status: "on", on_day: D.tue, on_at: "x" });
  const boat = prop({ title: "Overnight boat" });
  const all = [suits, boat];

  it("finds days a person is ON for elsewhere", () => {
    const rs = [resp(suits.id, "priya", "in", [D.tue])];
    const c = conflictsFor(all, rs);
    expect(conflictFor("priya", [D.mon, D.tue], c, boat.id)?.proposal.title).toBe("Suits in Hoi An");
    expect(conflictFor("priya", [D.mon], c, boat.id)).toBeNull();
    expect(conflictFor("priya", [D.tue], c, suits.id)).toBeNull();
  });

  it("a conflicted day does not count toward heat elsewhere", () => {
    const rs = [resp(suits.id, "priya", "in", [D.tue]), resp(boat.id, "priya", "in", [D.mon, D.tue]), resp(boat.id, "marcus", "in", [D.tue])];
    const c = conflictsFor(all, rs);
    expect(heatOf(heat(BOARD, rs.filter((r) => r.proposal_id === boat.id), c))).toEqual({ [D.mon]: 1, [D.tue]: 1 });
  });

  it("maybe on the ON proposal is no conflict", () => {
    const c = conflictsFor(all, [resp(suits.id, "priya", "maybe", [D.tue])]);
    expect(c.size).toBe(0);
  });
});

describe("sortBoard", () => {
  it("orders B (ready), A (2 more), E (4 more), C (ON), D (idled)", () => {
    const A = prop({ title: "A", min_count: 4 });
    const B = prop({ title: "B", min_count: 4 });
    const C = prop({ title: "C", status: "on", on_day: D.thu, on_at: "x" });
    const Dp = prop({ title: "D", deadline: "2027-01-01" });
    const E = prop({ title: "E", min_count: 5 });
    const items = [
      { proposal: A, responses: crowd(A, 2, [D.tue]) },
      { proposal: B, responses: crowd(B, 4, [D.tue]) },
      { proposal: C, responses: crowd(C, 4, [D.thu]) },
      { proposal: Dp, responses: [] },
      { proposal: E, responses: crowd(E, 1, [D.tue]) },
    ];
    const s = sortBoard(items, BOARD, undefined, NOW);
    expect([...s.open, ...s.on, ...s.past].map((i) => i.proposal.title)).toEqual(["B", "A", "E", "C", "D"]);
  });

  it("breaks ties by newest", () => {
    const old = prop({ title: "old", created_at: "2026-11-01T00:00:00.000Z" });
    const young = prop({ title: "young", created_at: "2026-11-02T00:00:00.000Z" });
    const s = sortBoard([{ proposal: old, responses: [] }, { proposal: young, responses: [] }], BOARD, undefined, NOW);
    expect(s.open.map((i) => i.proposal.title)).toEqual(["young", "old"]);
  });

  it("puts closed proposals under past", () => {
    const s = sortBoard([{ proposal: prop({ status: "closed", closed_at: "x" }), responses: [] }], BOARD, undefined, NOW);
    expect(s.past).toHaveLength(1);
  });
});
