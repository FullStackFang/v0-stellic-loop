// board-window and the rolling parts of quorum-and-lock, on pure rows.
import { describe, expect, it } from "vitest";
import { best, cardRow, conflictsFor, heat, idledAt, stateOf } from "../quorum";
import type { BoardData } from "../load";
import type { Board, Proposal, Response } from "../types";
import { cardModel, peopleLists, rosterText, type PersonRow } from "../view";
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
    const lists = peopleLists(p, rs, new Map([["priya", { id: "priya", name: "Priya", show_name: true }]]), null, new Map(), ROLLING, now);
    expect(lists.in[0].days).toBe("Thu");
    const c = cardModel(p, data(ROLLING, [p], rs), { id: "priya", show_name: true }, now);
    expect(c.myDays).toEqual(["2026-11-05"]);
  });

  it("a past cell on a fixed board's card is blank", () => {
    const p = prop();
    const rs = crowd(p, 3, [D.mon, D.thu]);
    const c = cardModel(p, data(BOARD, [p], rs), null, at(D.wed));
    expect(c.heat!.map((h) => h.count)).toEqual([0, 0, 0, 0, 3, 0, 0]);
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
    const c = cardModel(p, data(ROLLING, [p], rs), null, now);
    expect(c.ask?.dayLong).toBe("Friday 20");
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

describe("the card's row of seven", () => {
  const cells = Array.from({ length: 14 }, (_, i) => ({ day: `d${String(i).padStart(2, "0")}` }));

  it("shows days 1–7 unless the best or locked day is in the second week", () => {
    expect(cardRow(cells, null).map((c) => c.day)).toEqual(cells.slice(0, 7).map((c) => c.day));
    expect(cardRow(cells, "d03")).toEqual(cells.slice(0, 7));
    expect(cardRow(cells, "d09")).toEqual(cells.slice(7, 14));
    expect(cardRow(cells.slice(0, 7), "d03")).toEqual(cells.slice(0, 7));
  });

  it("a rolling card with its best day 10 days out shows window days 8–14", () => {
    const p = prop({ deadline: "2026-11-16" });
    const rs = crowd(p, 3, ["2026-11-13"]);
    const c = cardModel(p, data(ROLLING, [p], rs), null, at("2026-11-03"));
    const row = cardRow(c.heat!, c.bestDay);
    expect(row[0].day).toBe("2026-11-10");
    expect(row.find((h) => h.best)?.day).toBe("2026-11-13");
    expect(c.date).toMatchObject({ small: "Nov", big: "13" });
  });
});

describe("copy names", () => {
  const row = (name: string, o: Partial<PersonRow> = {}): PersonRow => ({ name, me: false, anon: false, days: "", ...o });

  it("Ski trip: three named, two hidden, Hana maybe", () => {
    const lists = {
      in: [row("Priya"), row("Marcus"), row("Dana"), row("+1 anonymous", { anon: true }), row("+1 anonymous", { anon: true })],
      maybe: [row("Hana")],
    };
    expect(rosterText("Ski trip", lists, null)).toBe("Ski trip · 5 in\nPriya, Marcus, Dana and 2 more · Maybe: Hana");
  });

  it("the viewer is copied under their own name, or counted when their name is off", () => {
    expect(rosterText("Boat", { in: [row("You", { me: true }), row("Marcus")], maybe: [] }, "Priya")).toBe("Boat · 2 in\nPriya, Marcus");
    expect(rosterText("Boat", { in: [row("You (+1 anonymous)", { me: true, anon: true }), row("Marcus")], maybe: [] }, "Priya")).toBe("Boat · 2 in\nMarcus and 1 more");
  });

  it("everyone hidden is a count", () => {
    expect(rosterText("Shirts", { in: [row("+1 anonymous", { anon: true })], maybe: [] }, null)).toBe("Shirts · 1 in\n1 more");
  });
});
