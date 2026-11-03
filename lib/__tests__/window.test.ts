// board-window and the rolling parts of quorum-and-lock, on pure rows.
import { describe, expect, it } from "vitest";
import { best, conflictsFor, heat, idledAt, stateOf } from "../quorum";
import type { BoardData } from "../load";
import type { Board, Proposal, Response } from "../types";
import { planModel } from "../view";
import { BOARD, crowd, D, prop, resp } from "./fixtures";

const ROLLING: Board = { id: "r", slug: "strategy-team", name: "Strategy team", tz: "America/New_York", window_kind: "rolling", window_start: null, window_end: null };
/** noon in New York on a given day */
const at = (day: string) => new Date(`${day}T17:00:00Z`);
const heatOf = (cells: { day: string; count: number }[]) => Object.fromEntries(cells.filter((c) => c.count).map((c) => [c.day, c.count]));
const data = (board: Board, proposals: Proposal[], responses: Response[]): BoardData =>
  ({ board, proposals, responses, people: new Map(), conflicts: conflictsFor(proposals, responses) });

describe("past days never count", () => {
  it("mid-trip: Boat with Mon 6, Thu 4 at minimum 4 is ready on Thu 18", () => {
    const boat = prop({ title: "Boat", min_count: 4 });
    const rs = [...crowd(boat, 2, [D.mon], "a"), ...crowd(boat, 4, [D.mon, D.thu], "b")];
    const cells = heat(BOARD, rs, undefined, at(D.wed));
    expect(heatOf(cells)).toEqual({ [D.thu]: 4 });
    expect(cells).toHaveLength(7);
    expect(best(cells)).toEqual({ day: D.thu, count: 4 });
    expect(stateOf(boat, BOARD, rs, undefined, at(D.wed))).toBe("ready");
  });

  it("past day is not best: Mon 5, Thu 4 on a Wednesday → ready on Thu", () => {
    const p = prop({ min_count: 4 });
    const rs = [...crowd(p, 5, [D.mon], "m"), ...crowd(p, 4, [D.thu], "t")];
    expect(best(heat(BOARD, rs, undefined, at(D.wed)))?.day).toBe(D.thu);
  });

  it("yesterday on a rolling board adds nothing and is not listed by her name", () => {
    const p = prop({ deadline: "2026-11-16" });
    const rs = [resp(p.id, "priya", "in", ["2026-11-02", "2026-11-05"])];
    const now = at("2026-11-03");
    expect(heatOf(heat(ROLLING, rs, undefined, now))).toEqual({ "2026-11-05": 1 });
    const c = planModel(p, data(ROLLING, [p], rs), { id: "priya", show_name: true }, now);
    expect(c.day).toBe("2026-11-05");
  });
});

describe("rolling windows", () => {
  it("heat covers today and the next 13 days, nothing on day 15", () => {
    const p = prop({ deadline: "2026-11-16" });
    const rs = [resp(p.id, "a", "in", ["2026-11-16", "2026-11-17"])];
    const cells = heat(ROLLING, rs, undefined, at("2026-11-03"));
    expect(cells).toHaveLength(14);
    expect(cells[0].day).toBe("2026-11-03");
    expect(heatOf(cells)).toEqual({ "2026-11-16": 1 });
  });

  it("best day after the deadline: posted Nov 3 (deadline Nov 16), four free Fri Nov 20 on Nov 10", () => {
    const p = prop({ title: "Case prep", deadline: "2026-11-16" });
    const rs = crowd(p, 4, ["2026-11-20"]);
    const now = at("2026-11-10");
    expect(stateOf(p, ROLLING, rs, undefined, now)).toBe("ready");
    const c = planModel(p, data(ROLLING, [p], rs), null, now);
    expect(c.day).toBe("2026-11-20");
  });

  it("an implied deadline idles at the end of that day: Room after class Thu, 2 of 4", () => {
    const p = prop({ title: "Room after class Thu", deadline: "2026-11-16" });
    const rs = crowd(p, 2, ["2026-11-12"]);
    expect(stateOf(p, ROLLING, rs, undefined, new Date("2026-11-17T04:59:00Z"))).toBe("open");
    expect(stateOf(p, ROLLING, rs, undefined, new Date("2026-11-17T05:00:00Z"))).toBe("idled");
  });

  it("idles from the deadline, else a fixed window's end; a rolling board without one never", () => {
    expect(idledAt(prop(), BOARD)).toBe(BOARD.window_end);
    expect(idledAt(prop(), ROLLING)).toBeNull();
    expect(idledAt(prop({ deadline: "2026-11-16" }), ROLLING)).toBe("2026-11-16");
    expect(idledAt(prop({ needs_day: false }), ROLLING)).toBeNull();
  });
});
