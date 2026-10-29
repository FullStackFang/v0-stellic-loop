import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  formCrews,
  formationInputHash,
  type EligibleMembership,
  type ExistingCrew,
  type FormationResult,
  type Intent,
} from "@/lib/formation";

const T0 = Date.parse("2026-10-17T09:00:00.000Z");

/** Member `id` tapped in `minutes` after 9:00. */
function member(id: string, intent: Intent, minutes = 0): EligibleMembership {
  return { id, intent, tappedInAt: new Date(T0 + minutes * 60_000).toISOString() };
}

/**
 * `count` members with ids `${prefix}1..n`, tapping in one minute apart with
 * `${prefix}1` the oldest, so pool order within an intent is id order.
 */
function members(count: number, intent: Intent, prefix = "m", startMinute = 0): EligibleMembership[] {
  return Array.from({ length: count }, (_, i) => member(`${prefix}${i + 1}`, intent, startMinute + i));
}

function crew(id: string, activeSize: number, opts: { formedAt?: string; anchored?: boolean } = {}): ExistingCrew {
  return {
    id,
    activeSize,
    formedAt: opts.formedAt ?? "2026-10-10T19:00:00.000Z",
    anchored: opts.anchored ?? false,
  };
}

const sizes = (r: FormationResult) => r.newCrews.map((c) => c.membershipIds.length);

describe("pool order", () => {
  it("orders going_want_crew first, then crew_conditional, each by tap-in time oldest first (spec: B, A, C)", () => {
    const a = member("A", "crew_conditional", 0); // 9:00
    const b = member("B", "going_want_crew", 30); // 9:30
    const c = member("C", "crew_conditional", 10); // 9:10
    const r = formCrews([a, b, c], [crew("x", 2)]);
    // A single crew of 2 absorbs all three, in pool order.
    expect(r.fills.map((f) => f.membershipId)).toEqual(["B", "A", "C"]);
  });

  it("tap-in time wins over id order within one intent", () => {
    const r = formCrews(
      [member("a", "crew_conditional", 10), member("z", "crew_conditional", 0)],
      [crew("x", 2)],
    );
    expect(r.fills.map((f) => f.membershipId)).toEqual(["z", "a"]);
  });

  it("breaks tap-in ties by membership id", () => {
    const r = formCrews(
      [member("b", "crew_conditional"), member("a", "crew_conditional"), member("c", "crew_conditional")],
      [crew("x", 2)],
    );
    expect(r.fills.map((f) => f.membershipId)).toEqual(["a", "b", "c"]);
  });

  it("ignores watching members defensively", () => {
    const r = formCrews([member("w", "watching"), ...members(4, "crew_conditional")], []);
    expect(r.newCrews).toEqual([{ membershipIds: ["m1", "m2", "m3", "m4"], anchored: false }]);
    expect(r.waiting).toEqual([]);
    expect(r.fills).toEqual([]);
  });
});

describe("step 1: fill existing crews to five", () => {
  it("adds a single latecomer to a crew of 4 and forms nothing", () => {
    const r = formCrews([member("late", "crew_conditional")], [crew("x", 4)]);
    expect(r.fills).toEqual([{ crewId: "x", membershipId: "late" }]);
    expect(r.newCrews).toEqual([]);
    expect(r.waiting).toEqual([]);
  });

  it("crew of four absorbs exactly one of three; the other two go to step 2 and wait", () => {
    const r = formCrews(members(3, "crew_conditional"), [crew("x", 4)]);
    expect(r.fills).toEqual([{ crewId: "x", membershipId: "m1" }]);
    expect(r.newCrews).toEqual([]);
    expect(r.waiting).toEqual(["m2", "m3"]);
  });

  it("two crews with space each get one, in formation order; the third goes to step 2", () => {
    const x = crew("x", 4, { formedAt: "2026-10-03T19:00:00.000Z" });
    const y = crew("y", 4, { formedAt: "2026-10-10T19:00:00.000Z" });
    const r = formCrews(members(3, "crew_conditional"), [y, x]);
    expect(r.fills).toEqual([
      { crewId: "x", membershipId: "m1" },
      { crewId: "y", membershipId: "m2" },
    ]);
    expect(r.newCrews).toEqual([]);
    expect(r.waiting).toEqual(["m3"]);
  });

  it("orders crews with the same formation time by id", () => {
    const r = formCrews(members(2, "crew_conditional"), [crew("b", 4), crew("a", 4)]);
    expect(r.fills).toEqual([
      { crewId: "a", membershipId: "m1" },
      { crewId: "b", membershipId: "m2" },
    ]);
  });

  it("crews of 5 or 6 receive nobody", () => {
    const r = formCrews(members(4, "crew_conditional"), [crew("five", 5), crew("six", 6)]);
    expect(r.fills).toEqual([]);
    expect(sizes(r)).toEqual([4]);
  });

  it("fills a small crew with several members, counting fills made in this run", () => {
    const r = formCrews(members(5, "crew_conditional"), [crew("x", 2)]);
    expect(r.fills.map((f) => f.membershipId)).toEqual(["m1", "m2", "m3"]);
    expect(r.newCrews).toEqual([]);
    expect(r.waiting).toEqual(["m4", "m5"]);
  });
});

describe("step 2: even packing", () => {
  it("seven remain: one crew of 6, one waits", () => {
    const r = formCrews(members(7, "crew_conditional"), []);
    expect(sizes(r)).toEqual([6]);
    expect(r.newCrews[0].membershipIds).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
    expect(r.waiting).toEqual(["m7"]);
  });

  it("nine remain: crews of 5 and 4, nobody waits", () => {
    const r = formCrews(members(9, "crew_conditional"), []);
    expect(sizes(r)).toEqual([5, 4]);
    expect(r.newCrews[0].membershipIds).toEqual(["m1", "m3", "m5", "m7", "m9"]);
    expect(r.newCrews[1].membershipIds).toEqual(["m2", "m4", "m6", "m8"]);
    expect(r.waiting).toEqual([]);
  });

  it("thirteen remain: crews of 5, 4, 4, nobody waits", () => {
    const r = formCrews(members(13, "crew_conditional"), []);
    expect(sizes(r)).toEqual([5, 4, 4]);
    expect(r.waiting).toEqual([]);
  });

  it("three remain: nobody placed, all three wait", () => {
    const r = formCrews(members(3, "crew_conditional"), [crew("full", 5)]);
    expect(r.fills).toEqual([]);
    expect(r.newCrews).toEqual([]);
    expect(r.waiting).toEqual(["m1", "m2", "m3"]);
  });

  it("six committed, no conditional: one crew of 6", () => {
    const r = formCrews(members(6, "going_want_crew"), []);
    expect(sizes(r)).toEqual([6]);
    expect(r.newCrews[0].anchored).toBe(true);
    expect(r.waiting).toEqual([]);
  });

  it("k = floor(n / 4): eight form 4+4, eleven form 6+5, twelve form 4+4+4", () => {
    expect(sizes(formCrews(members(8, "crew_conditional"), []))).toEqual([4, 4]);
    expect(sizes(formCrews(members(11, "crew_conditional"), []))).toEqual([6, 5]);
    expect(sizes(formCrews(members(12, "crew_conditional"), []))).toEqual([4, 4, 4]);
  });
});

describe("anchored flag", () => {
  it("one committed plus three conditional: one anchored crew of four", () => {
    const r = formCrews([...members(3, "crew_conditional", "c"), member("g", "going_want_crew", 50)], []);
    expect(r.newCrews).toEqual([{ membershipIds: ["g", "c1", "c2", "c3"], anchored: true }]);
    expect(r.waiting).toEqual([]);
  });

  it("round-robin spreads two committed across two crews of four, both anchored", () => {
    const r = formCrews([...members(6, "crew_conditional", "c"), ...members(2, "going_want_crew", "g")], []);
    expect(r.newCrews).toEqual([
      { membershipIds: ["g1", "c1", "c3", "c5"], anchored: true },
      { membershipIds: ["g2", "c2", "c4", "c6"], anchored: true },
    ]);
  });

  it("a conditional-only new crew is not anchored", () => {
    const r = formCrews(members(4, "crew_conditional"), []);
    expect(r.newCrews[0].anchored).toBe(false);
  });

  it("committed latecomer flips an unanchored crew of four", () => {
    const r = formCrews([member("g", "going_want_crew")], [crew("x", 4, { anchored: false })]);
    expect(r.fills).toEqual([{ crewId: "x", membershipId: "g" }]);
    expect(r.anchorsFlipped).toEqual(["x"]);
  });

  it("does not report a flip for an already anchored crew or a conditional fill", () => {
    expect(formCrews([member("g", "going_want_crew")], [crew("x", 4, { anchored: true })]).anchorsFlipped).toEqual([]);
    expect(formCrews([member("c", "crew_conditional")], [crew("x", 4, { anchored: false })]).anchorsFlipped).toEqual([]);
  });
});

describe("determinism", () => {
  it("a repeat run on unchanged state makes no fills and no new crews", () => {
    const pool = [...members(2, "going_want_crew", "g"), ...members(9, "crew_conditional", "c")];
    const first = formCrews(pool, [crew("x", 4)]);
    expect(first.fills).toHaveLength(1);
    expect(sizes(first)).toEqual([5, 5]);
    expect(first.waiting).toEqual([]);

    // Apply the first run: fills grow the existing crew, new crews become rows.
    const crewsAfter: ExistingCrew[] = [
      crew("x", 4 + first.fills.length, { anchored: first.anchorsFlipped.includes("x") }),
      ...first.newCrews.map((c, i) =>
        crew(`new${i + 1}`, c.membershipIds.length, { formedAt: "2026-10-17T19:00:00.000Z", anchored: c.anchored }),
      ),
    ];
    const stillEligible = pool.filter((m) => first.waiting.includes(m.id));

    const second = formCrews(stillEligible, crewsAfter);
    expect(second.fills).toEqual([]);
    expect(second.newCrews).toEqual([]);
    expect(second.anchorsFlipped).toEqual([]);
    expect(second.waiting).toEqual([]);
  });

  it("waiting members are still waiting on a repeat run when nothing changed", () => {
    const pool = members(3, "crew_conditional");
    const first = formCrews(pool, []);
    expect(first.waiting).toEqual(["m1", "m2", "m3"]);
    const second = formCrews(pool, []);
    expect(second).toEqual(first);
  });

  it("the same input gives the same output regardless of array order", () => {
    const pool = [...members(5, "crew_conditional", "c"), ...members(3, "going_want_crew", "g")];
    const crews = [crew("b", 4), crew("a", 3, { formedAt: "2026-10-03T19:00:00.000Z" })];
    const forward = formCrews(pool, crews);
    const reversed = formCrews([...pool].reverse(), [...crews].reverse());
    expect(reversed).toEqual(forward);
  });
});

describe("input hash", () => {
  const pool = [member("b", "crew_conditional", 5), member("a", "going_want_crew", 0)];
  const crews = [crew("y", 4), crew("x", 5)];

  it("is md5 of the canonical snapshot", () => {
    const canonical = [
      "m|a|going_want_crew|2026-10-17T09:00:00.000Z",
      "m|b|crew_conditional|2026-10-17T09:05:00.000Z",
      "c|x|5",
      "c|y|4",
    ].join("\n");
    const expected = createHash("md5").update(canonical).digest("hex");
    expect(formationInputHash(pool, crews)).toBe(expected);
    expect(formCrews(pool, crews).inputHash).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is stable across input ordering and timestamp spelling", () => {
    const h = formationInputHash(pool, crews);
    expect(formationInputHash([...pool].reverse(), [...crews].reverse())).toBe(h);
    const respelled = pool.map((m) => ({ ...m, tappedInAt: m.tappedInAt.replace(".000Z", "+00:00") }));
    expect(formationInputHash(respelled, crews)).toBe(h);
  });

  it("truncates fractional seconds beyond milliseconds and normalizes offsets to UTC", () => {
    const at = (tappedInAt: string) => formationInputHash([{ id: "a", intent: "crew_conditional", tappedInAt }], []);
    expect(at("2026-10-17T09:00:00.123456+00:00")).toBe(at("2026-10-17T09:00:00.123Z"));
    expect(at("2026-10-17T09:00:00.123999Z")).toBe(at("2026-10-17T09:00:00.123Z")); // truncated, not rounded
    expect(at("2026-10-17T05:00:00.000-04:00")).toBe(at("2026-10-17T09:00:00.000Z"));
    expect(at("2026-10-17 09:00:00.123456+00")).toBe(at("2026-10-17T09:00:00.123Z")); // Postgres text form
  });

  it("rejects a timestamp without a zone designator or that does not parse", () => {
    const at = (tappedInAt: string) => () =>
      formationInputHash([{ id: "a", intent: "crew_conditional", tappedInAt }], []);
    expect(at("2026-10-17 09:00:00")).toThrow(/zone designator/);
    expect(at("2026-10-17T09:00:00")).toThrow(/zone designator/);
    expect(at("not a date")).toThrow();
  });

  it("changes when a member is added, an intent changes, or a crew size changes", () => {
    const h = formationInputHash(pool, crews);
    expect(formationInputHash([...pool, member("c", "crew_conditional", 9)], crews)).not.toBe(h);
    expect(formationInputHash([pool[0], { ...pool[1], intent: "crew_conditional" }], crews)).not.toBe(h);
    expect(formationInputHash(pool, [crews[0], { ...crews[1], activeSize: 4 }])).not.toBe(h);
  });

  it("ignores watching members, matching the pool", () => {
    const h = formationInputHash(pool, crews);
    expect(formationInputHash([...pool, member("w", "watching")], crews)).toBe(h);
  });
});
