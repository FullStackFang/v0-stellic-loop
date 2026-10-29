/**
 * Daily occurrence top-up for weekly loops (attendance-tracking "Occurrences
 * derive from the weekly slot"). Keeps the next 4 occurrences materialized.
 *
 * One-off loops are never touched: the query selects only rows with a weekly
 * slot (`weekday is not null`), and loop_shape_check guarantees those have
 * no `single_occurrence_at`.
 *
 * Takes the client as the minimal interface it uses so a hand-written fake
 * can drive it in Vitest. The real service-role client implements it at
 * runtime, but checking that structurally hits TS2589 (instantiation too
 * deep) on the untyped SupabaseClient, so the cron route casts at the call.
 */

import { missingStarts } from "@/lib/occurrences";

type Result<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

export interface LoopSlotRow {
  id: string;
  /** ISO weekday 1-7, non-null for every row the query returns */
  weekday: number;
  /** Postgres `time`, serialized 'HH:MM:SS' */
  start_local: string;
  duration_min: number;
  /** To-one join through loop.campus_id */
  campus: { tz: string } | null;
}

export interface OccurrenceStartRow {
  starts_at: string;
}

export interface OccurrenceInsert {
  loop_id: string;
  starts_at: string;
}

/** One overload per table so the real client's row type is inferred per table. */
export interface TopUpClient {
  from(table: "loop"): {
    select(columns: string): {
      not(
        column: string,
        operator: "is",
        value: null,
      ): { order(column: string): Result<LoopSlotRow[]> };
    };
  };
  from(table: "occurrence"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): { gte(column: string, value: string): Result<OccurrenceStartRow[]> };
    };
    upsert(
      rows: OccurrenceInsert[],
      options: { onConflict: string; ignoreDuplicates: boolean },
    ): { select(columns: string): Result<OccurrenceStartRow[]> };
  };
}

export interface TopUpFailure {
  loopId: string;
  message: string;
}

export interface TopUpResult {
  loops: number;
  inserted: number;
  failed: TopUpFailure[];
}

async function unwrap<T>(result: Result<T>, what: string): Promise<T | null> {
  const { data, error } = await result;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

/**
 * Tops up every weekly loop to the next 4 occurrences. Returns the number of
 * weekly loops examined, the number of rows actually inserted, and the loops
 * that failed. A broken loop is recorded in `failed` and the run moves on;
 * only a failure of the loop select itself throws. Inserts ignore duplicates
 * on (loop_id, starts_at), so a concurrent run is harmless.
 */
export async function topUpOccurrences(db: TopUpClient, now: Date): Promise<TopUpResult> {
  const loops =
    (await unwrap(
      db
        .from("loop")
        .select("id, weekday, start_local, duration_min, campus:campus_id ( tz )")
        .not("weekday", "is", null)
        .order("id"),
      "select weekly loops",
    )) ?? [];

  let inserted = 0;
  const failed: TopUpFailure[] = [];
  for (const loop of loops) {
    try {
      const tz = loop.campus?.tz;
      if (!tz) throw new Error(`loop ${loop.id} has no campus tz`);

      // Future rows only. Cancelled future rows are still included and still
      // block regeneration: regenerating a cancelled week would collide with
      // unique(loop_id, starts_at) and un-cancel it in spirit.
      const existing =
        (await unwrap(
          db
            .from("occurrence")
            .select("starts_at")
            .eq("loop_id", loop.id)
            .gte("starts_at", now.toISOString()),
          `select occurrences of loop ${loop.id}`,
        )) ?? [];

      const missing = missingStarts(
        {
          weekday: loop.weekday,
          startLocal: loop.start_local,
          durationMin: loop.duration_min,
          tz,
        },
        now,
        existing.map((row) => new Date(row.starts_at)),
      );
      if (missing.length === 0) continue;

      // With ignoreDuplicates, PostgREST returns only the rows it inserted.
      const added = await unwrap(
        db
          .from("occurrence")
          .upsert(
            missing.map((d) => ({ loop_id: loop.id, starts_at: d.toISOString() })),
            { onConflict: "loop_id,starts_at", ignoreDuplicates: true },
          )
          .select("starts_at"),
        `insert occurrences of loop ${loop.id}`,
      );
      inserted += added?.length ?? 0;
    } catch (err) {
      failed.push({ loopId: loop.id, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { loops: loops.length, inserted, failed };
}
