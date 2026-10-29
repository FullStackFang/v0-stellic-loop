import { createHash } from "node:crypto";

/**
 * Crew formation: a pure, deterministic packing rule.
 *
 * Takes the eligible pool and the loop's existing crews, returns placements.
 * The organizer action runs this for the preview; the Postgres function
 * `apply_formation` applies the result after recomputing `inputHash` from
 * current rows and aborting on mismatch. The packing algorithm lives only here.
 *
 * Eligibility (not left, not already crewed, intent in the two eligible
 * values) is the caller's job; `watching` is still ignored defensively.
 */

export type Intent = "crew_conditional" | "going_want_crew" | "watching";

export interface EligibleMembership {
  id: string;
  intent: Intent;
  /** ISO 8601 timestamp of the tap-in. */
  tappedInAt: string;
}

export interface ExistingCrew {
  id: string;
  /** ISO 8601 timestamp of when the crew formed. */
  formedAt: string;
  /** Members with `left_at is null`. */
  activeSize: number;
  anchored: boolean;
}

export interface FormationResult {
  /** Step 1: members added to existing crews, in pool order. */
  fills: { crewId: string; membershipId: string }[];
  /** Step 2: new crews, each listing its members in pool order. */
  newCrews: { membershipIds: string[]; anchored: boolean }[];
  /** Existing crew ids that become anchored because a `going_want_crew` member filled them. */
  anchorsFlipped: string[];
  /** Eligible members left unplaced, in pool order. */
  waiting: string[];
  /** md5 of the canonical input snapshot; see `formationInputHash`. */
  inputHash: string;
}

/** Step 1 fills an existing crew only while it has fewer than this many active members. */
const FILL_BELOW = 5;
/** Step 2 forms a new crew only when at least this many remain. */
const MIN_NEW_CREW = 4;
/** No crew ever exceeds this size. */
const MAX_CREW = 6;

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `Z`, `±HH:MM`, `±HHMM`, or `±HH` at the end of a timestamp. */
const ZONE_DESIGNATOR = /(Z|[+-]\d{2}(:?\d{2})?)$/;

/**
 * Normalizes a zoned timestamp to ISO 8601 UTC with milliseconds. Fractional
 * seconds beyond milliseconds are truncated, not rounded. A timestamp without a
 * zone designator throws: `Date.parse` would read it in the server's local
 * zone, and the hash must never depend on where it is computed.
 */
function canonicalTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms) || !ZONE_DESIGNATOR.test(iso)) {
    throw new Error(`formation: timestamp must be valid and carry a zone designator: ${JSON.stringify(iso)}`);
  }
  return new Date(ms).toISOString();
}

/**
 * Pool order: all `going_want_crew` by tap-in time, then all `crew_conditional`
 * by tap-in time, ties by membership id. `watching` is dropped.
 *
 * Tap-in time sorts oldest first: whoever has waited longest is placed first.
 * Spec scenario: A (conditional, 9:00), B (committed, 9:30), C (conditional,
 * 9:10) → B, A, C.
 */
function orderPool(eligible: EligibleMembership[]): EligibleMembership[] {
  const rank = (m: EligibleMembership) => (m.intent === "going_want_crew" ? 0 : 1);
  return eligible
    .filter((m) => m.intent !== "watching")
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Date.parse(a.tappedInAt) - Date.parse(b.tappedInAt) ||
        compareStrings(a.id, b.id),
    );
}

/**
 * Canonical input snapshot, hashed with md5. The SQL `apply_formation`
 * recomputes exactly this string from current rows, so the form is fixed:
 *
 *   one line per eligible membership (any intent other than `watching`),
 *   sorted by membership id:
 *     m|<membership id>|<intent>|<tappedInAt as ISO 8601 UTC with milliseconds, e.g. 2026-10-17T19:00:00.000Z>
 *   then one line per existing crew, sorted by crew id:
 *     c|<crew id>|<activeSize>
 *   lines joined with "\n", no trailing newline.
 *
 * Canonicalization rules the SQL recomputation in `apply_formation` must match:
 *   - fractional seconds beyond milliseconds are truncated, not rounded
 *     (`.123456` → `.123`; `.123999` → `.123`);
 *   - ids are sorted in byte order (`COLLATE "C"` in SQL), never locale order.
 */
export function formationInputHash(eligible: EligibleMembership[], crews: ExistingCrew[]): string {
  const memberLines = eligible
    .filter((m) => m.intent !== "watching")
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((m) => `m|${m.id}|${m.intent}|${canonicalTime(m.tappedInAt)}`);
  const crewLines = crews
    .slice()
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((c) => `c|${c.id}|${c.activeSize}`);
  return createHash("md5").update([...memberLines, ...crewLines].join("\n")).digest("hex");
}

export function formCrews(eligible: EligibleMembership[], crews: ExistingCrew[]): FormationResult {
  const pool = orderPool(eligible);

  // Step 1: fill the oldest existing crews (formedAt, then id) to FILL_BELOW.
  const open = crews
    .map((c) => ({ id: c.id, formedAt: Date.parse(c.formedAt), size: c.activeSize, anchored: c.anchored }))
    .sort((a, b) => a.formedAt - b.formedAt || compareStrings(a.id, b.id));

  const fills: FormationResult["fills"] = [];
  const anchorsFlipped: string[] = [];
  let next = 0;
  for (const crew of open) {
    while (crew.size < FILL_BELOW && next < pool.length) {
      const member = pool[next++];
      fills.push({ crewId: crew.id, membershipId: member.id });
      crew.size += 1;
      if (member.intent === "going_want_crew" && !crew.anchored) {
        crew.anchored = true;
        anchorsFlipped.push(crew.id);
      }
    }
  }

  // Step 2: even packing of the remainder, round-robin in pool order.
  const remaining = pool.slice(next);
  const n = remaining.length;
  const k = n >= MIN_NEW_CREW ? Math.floor(n / MIN_NEW_CREW) : 0;
  const placed = Math.min(n, MAX_CREW * k);

  const newCrews: FormationResult["newCrews"] = Array.from({ length: k }, () => ({
    membershipIds: [],
    anchored: false,
  }));
  for (let i = 0; i < placed; i++) {
    const crew = newCrews[i % k];
    crew.membershipIds.push(remaining[i].id);
    if (remaining[i].intent === "going_want_crew") crew.anchored = true;
  }

  return {
    fills,
    newCrews,
    anchorsFlipped,
    waiting: remaining.slice(placed).map((m) => m.id),
    inputHash: formationInputHash(eligible, crews),
  };
}
