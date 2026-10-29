import "server-only";
import {
  formCrews,
  type EligibleMembership,
  type ExistingCrew,
  type FormationResult,
  type Intent,
} from "@/lib/formation";
import type { AdminClient } from "@/lib/loops";

/**
 * Runs crew formation against the database: loads the input, previews it with
 * the pure `formCrews`, and confirms through the Postgres `apply_formation`.
 *
 * Input parity with SQL `formation_input_hash(loop_id)` (0001_schema.sql): the
 * loader feeds `formCrews` exactly the rows that function reads, so the TS
 * `inputHash` and the SQL hash agree on unchanged state:
 *   - eligible = membership of the loop with left_at is null, crew_id is null,
 *     intent in ('crew_conditional', 'going_want_crew'); left, crewed and
 *     watching members are excluded here, not left to formCrews;
 *   - crews    = every crew of the loop (full ones too), activeSize = count of
 *     memberships with crew_id = crew.id and left_at is null. The composite FK
 *     (crew_id, loop_id) means such memberships always belong to the same loop,
 *     so counting the loop's active memberships by crew_id is the same count.
 * Timestamps come from PostgREST as timestamptz text with an offset
 * (e.g. `+00:00`), which formation.ts requires.
 */

const ELIGIBLE_INTENTS: Intent[] = ["crew_conditional", "going_want_crew"];

export interface FormationInput {
  eligible: EligibleMembership[];
  crews: ExistingCrew[];
}

/** Counts only: no names, safe for the dashboard preview. */
export interface FormationCounts {
  /** Members placed into existing crews. */
  placedIntoExisting: number;
  /** Member count of each new crew, in creation order. */
  newCrewSizes: number[];
  /** Eligible members left unplaced. */
  waiting: number;
}

export type FormationPreview = FormationResult & { counts: FormationCounts };

export type ConfirmFormationResult =
  | { ok: true; placedMembershipIds: string[]; crewIds: string[] }
  | { ok: false; reason: "input_changed" | "error" };

/** The `p_placements` jsonb `apply_formation` reads. */
export interface ApplyFormationPlacements {
  fills: { crew_id: string; membership_id: string }[];
  new_crews: { membership_ids: string[] }[];
}

/** The exception message `apply_formation` raises (SQLSTATE P0001) on a hash mismatch. */
const INPUT_CHANGED = "formation_input_changed";

interface MembershipRow {
  id: string;
  intent: Intent;
  tapped_in_at: string;
  crew_id: string | null;
}

interface CrewRow {
  id: string;
  formed_at: string;
  anchored: boolean;
}

/** Throws on a database error. */
export async function loadFormationInput(db: AdminClient, loopId: string): Promise<FormationInput> {
  const [members, crewRows] = await Promise.all([
    // PostgREST caps a response at max_rows (Supabase default 1000) without an
    // error; an explicit range asks for up to 5000 rows. Raise max_rows to match
    // before a loop can have more active members than the cap.
    db
      .from("membership")
      .select("id, intent, tapped_in_at, crew_id")
      .eq("loop_id", loopId)
      .is("left_at", null)
      .range(0, 4999),
    db.from("crew").select("id, formed_at, anchored").eq("loop_id", loopId),
  ]);
  if (members.error) throw new Error(`loadFormationInput: membership: ${members.error.message}`);
  if (crewRows.error) throw new Error(`loadFormationInput: crew: ${crewRows.error.message}`);

  const active = (members.data ?? []) as MembershipRow[];
  const activeSize = new Map<string, number>();
  for (const m of active) {
    if (m.crew_id !== null) activeSize.set(m.crew_id, (activeSize.get(m.crew_id) ?? 0) + 1);
  }

  const eligible = active
    .filter((m) => m.crew_id === null && ELIGIBLE_INTENTS.includes(m.intent))
    .map((m) => ({ id: m.id, intent: m.intent, tappedInAt: m.tapped_in_at }));
  const crews = ((crewRows.data ?? []) as CrewRow[]).map((c) => ({
    id: c.id,
    formedAt: c.formed_at,
    activeSize: activeSize.get(c.id) ?? 0,
    anchored: c.anchored,
  }));
  return { eligible, crews };
}

/** Throws on a database error. */
export async function previewFormation(db: AdminClient, loopId: string): Promise<FormationPreview> {
  const { eligible, crews } = await loadFormationInput(db, loopId);
  const result = formCrews(eligible, crews);
  return {
    ...result,
    counts: {
      placedIntoExisting: result.fills.length,
      newCrewSizes: result.newCrews.map((c) => c.membershipIds.length),
      waiting: result.waiting.length,
    },
  };
}

export function toPlacements(result: FormationResult): ApplyFormationPlacements {
  return {
    fills: result.fills.map((f) => ({ crew_id: f.crewId, membership_id: f.membershipId })),
    new_crews: result.newCrews.map((c) => ({ membership_ids: [...c.membershipIds] })),
  };
}

/**
 * Re-loads and re-computes placements, then applies them in one transaction.
 * `inputHash` is the preview's hash: a different recomputed hash returns
 * `input_changed` without touching the database, and `apply_formation` checks
 * it again under its lock. Never throws.
 */
export async function confirmFormation(
  db: AdminClient,
  loopId: string,
  inputHash: string,
): Promise<ConfirmFormationResult> {
  try {
    const { eligible, crews } = await loadFormationInput(db, loopId);
    const result = formCrews(eligible, crews);
    if (result.inputHash !== inputHash) return { ok: false, reason: "input_changed" };

    const { error } = await db.rpc("apply_formation", {
      p_loop_id: loopId,
      p_placements: toPlacements(result),
      p_input_hash: inputHash,
    });
    if (error) {
      // PostgREST surfaces `raise exception '<msg>'` as { code: "P0001", message: "<msg>" };
      // every apply_formation raise is P0001, so code plus message identify the hash check.
      if (error.code === "P0001" && error.message === INPUT_CHANGED) {
        return { ok: false, reason: "input_changed" };
      }
      console.error(`confirmFormation: apply_formation: ${error.code ?? ""} ${error.message}`);
      return { ok: false, reason: "error" };
    }

    const placedMembershipIds = [
      ...result.fills.map((f) => f.membershipId),
      ...result.newCrews.flatMap((c) => c.membershipIds),
    ];
    return { ok: true, placedMembershipIds, crewIds: await placedCrewIds(db, result, placedMembershipIds) };
  } catch (err) {
    console.error("confirmFormation:", err);
    return { ok: false, reason: "error" };
  }
}

/**
 * Distinct crews that received members: filled existing crews plus the new
 * ones, whose ids only the database knows, so they are read back. The
 * placements are already committed, so a failed read-back is logged and falls
 * back to the filled crews rather than reporting the confirm as failed.
 */
async function placedCrewIds(db: AdminClient, result: FormationResult, placed: string[]): Promise<string[]> {
  const fillCrews = [...new Set(result.fills.map((f) => f.crewId))];
  if (result.newCrews.length === 0) return fillCrews;
  const { data, error } = await db.from("membership").select("id, crew_id").in("id", placed);
  if (error) {
    console.error(`confirmFormation: reading new crew ids: ${error.message}`);
    return fillCrews;
  }
  const ids = new Set(fillCrews);
  for (const row of (data ?? []) as { crew_id: string | null }[]) if (row.crew_id) ids.add(row.crew_id);
  return [...ids];
}
