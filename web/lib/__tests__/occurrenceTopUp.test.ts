import { describe, expect, it } from "vitest";
import { nextWeeklyStarts, type Slot } from "@/lib/occurrences";
import {
  topUpOccurrences,
  type LoopSlotRow,
  type OccurrenceInsert,
  type TopUpClient,
} from "@/lib/occurrenceTopUp";

const NY = "America/New_York";
const NOW = new Date("2026-10-13T15:00:00Z"); // Tue Oct 13 2026, 11:00 EDT
const thursday7pm: Slot = { weekday: 4, startLocal: "19:00", durationMin: 90, tz: NY };

/** A `loop` row as the service-role select would return it (weekly or one-off). */
type FakeLoop = Omit<LoopSlotRow, "weekday" | "start_local"> & {
  weekday: number | null;
  start_local: string | null;
  single_occurrence_at: string | null;
};

interface FakeOccurrence {
  loop_id: string;
  starts_at: string;
  cancelled: boolean;
}

/**
 * In-memory stand-in for the two tables the job touches. Records every upsert
 * batch and every select column string; the upsert echoes back only the rows
 * that were not already present, like PostgREST with ignoreDuplicates.
 */
class FakeDb implements TopUpClient {
  inserts: OccurrenceInsert[][] = [];
  selects: { table: string; columns: string }[] = [];
  /** Loop ids whose occurrence select returns an error. */
  failOccurrenceSelectFor = new Set<string>();
  /** Rows a concurrent run inserted: invisible to the select, but they block the upsert. */
  raced: FakeOccurrence[] = [];

  constructor(
    public loops: FakeLoop[],
    public occurrences: FakeOccurrence[],
  ) {}

  from(table: "loop" | "occurrence") {
    return {
      select: (columns: string) => {
        this.selects.push({ table, columns });
        return {
          not: (column: string) => ({
            order: async (orderBy: string) => ({
              data:
                table === "loop"
                  ? (this.loops
                      .filter((l) => l[column as keyof FakeLoop] !== null)
                      .sort((a, b) =>
                        String(a[orderBy as keyof FakeLoop]).localeCompare(
                          String(b[orderBy as keyof FakeLoop]),
                        ),
                      ) as LoopSlotRow[])
                  : [],
              error: null,
            }),
          }),
          eq: (column: string, value: string) => ({
            gte: async (gteColumn: string, gteValue: string) => {
              if (this.failOccurrenceSelectFor.has(value)) {
                return { data: null, error: { message: "boom" } };
              }
              return {
                data:
                  table === "occurrence"
                    ? this.occurrences
                        .filter((o) => o[column as "loop_id"] === value)
                        .filter((o) => o[gteColumn as "starts_at"] >= gteValue)
                        .map(({ starts_at }) => ({ starts_at }))
                    : [],
                error: null,
              };
            },
          }),
        };
      },
      upsert: (rows: OccurrenceInsert[]) => ({
        select: async () => {
          this.inserts.push(rows);
          const present = new Set(
            [...this.occurrences, ...this.raced].map((o) => `${o.loop_id}|${o.starts_at}`),
          );
          const fresh = rows.filter((r) => !present.has(`${r.loop_id}|${r.starts_at}`));
          return { data: fresh.map(({ starts_at }) => ({ starts_at })), error: null };
        },
      }),
    };
  }

  /** What the database would hold after the recorded inserts land. */
  applyInserts(): void {
    for (const batch of this.inserts) {
      for (const row of batch) this.occurrences.push({ ...row, cancelled: false });
    }
    this.inserts = [];
  }

  insertedStarts(): string[] {
    return this.inserts.flat().map((r) => r.starts_at);
  }
}

function weeklyLoop(id: string): FakeLoop {
  return {
    id,
    weekday: 4,
    start_local: "19:00:00",
    duration_min: 90,
    single_occurrence_at: null,
    campus: { tz: NY },
  };
}

function oneOffLoop(id: string): FakeLoop {
  return {
    id,
    weekday: null,
    start_local: null,
    duration_min: 120,
    single_occurrence_at: "2026-11-03T23:00:00.000Z",
    campus: { tz: NY },
  };
}

function rows(loopId: string, starts: Date[], cancelled = false): FakeOccurrence[] {
  return starts.map((d) => ({ loop_id: loopId, starts_at: d.toISOString(), cancelled }));
}

const next5 = nextWeeklyStarts(thursday7pm, NOW, 5);

describe("topUpOccurrences", () => {
  it("adds exactly the fourth week when three future rows exist", async () => {
    const db = new FakeDb([weeklyLoop("a")], rows("a", next5.slice(0, 3)));

    const result = await topUpOccurrences(db, NOW);

    expect(result).toEqual({ loops: 1, inserted: 1, failed: [] });
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toEqual([{ loop_id: "a", starts_at: next5[3].toISOString() }]);
  });

  it("selects the loop columns explicitly, joining campus tz", async () => {
    const db = new FakeDb([weeklyLoop("a")], []);

    await topUpOccurrences(db, NOW);

    const loopSelect = db.selects.find((s) => s.table === "loop");
    expect(loopSelect?.columns).toContain("campus:campus_id");
    expect(loopSelect?.columns).not.toContain("*");
  });

  it("adds nothing when four future rows exist", async () => {
    const db = new FakeDb([weeklyLoop("a")], rows("a", next5.slice(0, 4)));

    const result = await topUpOccurrences(db, NOW);

    expect(result).toEqual({ loops: 1, inserted: 0, failed: [] });
    expect(db.inserts).toEqual([]);
  });

  it("is idempotent: a second run after the inserts land adds nothing", async () => {
    const db = new FakeDb([weeklyLoop("a")], rows("a", next5.slice(0, 3)));

    await topUpOccurrences(db, NOW);
    db.applyInserts();
    const second = await topUpOccurrences(db, NOW);

    expect(second).toEqual({ loops: 1, inserted: 0, failed: [] });
    expect(db.inserts).toEqual([]);
    expect(db.occurrences).toHaveLength(4);
  });

  it("counts only rows actually inserted, not rows sent", async () => {
    const db = new FakeDb([weeklyLoop("a")], rows("a", next5.slice(0, 2)));
    db.raced = rows("a", [next5[2]]); // a concurrent run beat us to week 3

    const result = await topUpOccurrences(db, NOW);

    expect(db.insertedStarts()).toHaveLength(2);
    expect(result).toEqual({ loops: 1, inserted: 1, failed: [] });
  });

  it("never touches a one-off loop", async () => {
    const db = new FakeDb(
      [oneOffLoop("kickoff")],
      rows("kickoff", [new Date("2026-11-03T23:00:00.000Z")]),
    );

    const result = await topUpOccurrences(db, NOW);

    expect(result).toEqual({ loops: 0, inserted: 0, failed: [] });
    expect(db.inserts).toEqual([]);
  });

  it("skips a one-off loop while topping up a weekly one beside it", async () => {
    const db = new FakeDb(
      [weeklyLoop("a"), oneOffLoop("kickoff")],
      [...rows("a", next5.slice(0, 2)), ...rows("kickoff", [new Date("2026-11-03T23:00:00.000Z")])],
    );

    const result = await topUpOccurrences(db, NOW);

    expect(result).toEqual({ loops: 1, inserted: 2, failed: [] });
    expect(db.inserts.flat().every((r) => r.loop_id === "a")).toBe(true);
  });

  it("does not regenerate a cancelled week", async () => {
    // Week 2 is cancelled (Thanksgiving-style); it must still count as existing.
    const existing = [
      ...rows("a", [next5[0]]),
      ...rows("a", [next5[1]], true),
      ...rows("a", [next5[2]]),
    ];
    const db = new FakeDb([weeklyLoop("a")], existing);

    const result = await topUpOccurrences(db, NOW);

    expect(result).toEqual({ loops: 1, inserted: 1, failed: [] });
    expect(db.insertedStarts()).toEqual([next5[3].toISOString()]);
    expect(db.insertedStarts()).not.toContain(next5[1].toISOString());
  });

  it("keeps going when one loop's occurrence select fails", async () => {
    const db = new FakeDb([weeklyLoop("a"), weeklyLoop("b")], []);
    db.failOccurrenceSelectFor.add("a");

    const result = await topUpOccurrences(db, NOW);

    expect(result.loops).toBe(2);
    expect(result.inserted).toBe(4);
    expect(result.failed).toEqual([
      { loopId: "a", message: expect.stringMatching(/select occurrences of loop a: boom/) },
    ]);
    expect(db.inserts.flat().map((r) => r.loop_id)).toEqual(["b", "b", "b", "b"]);
  });

  it("records a loop with no campus tz as failed instead of throwing", async () => {
    const db = new FakeDb([{ ...weeklyLoop("a"), campus: null }, weeklyLoop("b")], []);

    const result = await topUpOccurrences(db, NOW);

    expect(result.failed).toEqual([{ loopId: "a", message: "loop a has no campus tz" }]);
    expect(result.inserted).toBe(4);
  });

  it("throws when the loop select itself fails", async () => {
    const failing: TopUpClient = {
      from: () => ({
        select: () => ({
          not: () => ({ order: async () => ({ data: null, error: { message: "boom" } }) }),
          eq: () => ({ gte: async () => ({ data: [], error: null }) }),
        }),
        upsert: () => ({ select: async () => ({ data: [], error: null }) }),
      }),
    };

    await expect(topUpOccurrences(failing, NOW)).rejects.toThrow(/select weekly loops: boom/);
  });
});
