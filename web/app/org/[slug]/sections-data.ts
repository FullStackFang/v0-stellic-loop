import { cache } from "react";
import { chunks } from "@/lib/chunks";
import { OCCURRENCE_COLUMNS, type OccurrenceRow } from "@/lib/loops";
import { pickNextOccurrence } from "@/lib/occurrences";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AttendanceMark } from "@/app/org/[slug]/attendance-rules";

/**
 * One read of everything the Occurrences, Attendance, and Crews sections
 * show, shared by the three through React `cache` (one load per request).
 * Callers must have passed `requireOrganizerOfLoop` first: loop data is read
 * through RLS (organizer policies), and only `person` rows (first names) come
 * from the service role (design rule 3).
 */

export type { AttendanceMark };
export type RsvpStatus = "in" | "out" | "no_reply";

export type SectionMembership = {
  id: string;
  person_id: string;
  crew_id: string | null;
  crewed_at: string | null;
  left_at: string | null;
  tapped_in_at: string;
};

/** `v_crew_stats`, exactly its columns (0001_schema.sql). bigint arrives as number. */
export type CrewStatsRow = {
  crew_id: string;
  loop_id: string;
  formed_at: string;
  anchored: boolean;
  active_members: number;
  single_drop: boolean;
  met_count: number;
  reached_third: boolean;
  present: number;
  denominator: number;
  said_in: number;
  said_in_and_came: number;
};

export const CREW_STATS_COLUMNS =
  "crew_id, loop_id, formed_at, anchored, active_members, single_drop, met_count, reached_third, present, denominator, said_in, said_in_and_came";

const MEMBERSHIP_COLUMNS = "id, person_id, crew_id, crewed_at, left_at, tapped_in_at";

export type SectionData = {
  now: Date;
  /** Every occurrence of the loop, by start. */
  occurrences: OccurrenceRow[];
  /** The next occurrence ("this week"): earliest not cancelled whose end is after now. */
  next: OccurrenceRow | null;
  memberships: SectionMembership[];
  /** `${occurrence_id}:${membership_id}` → RSVP status */
  rsvps: Map<string, RsvpStatus>;
  /** `${occurrence_id}:${membership_id}` → attendance mark */
  marks: Map<string, AttendanceMark>;
  /** Memberships with at least one attendance mark (left members included). */
  markedMembershipIds: string[];
  crewStats: CrewStatsRow[];
  /** person id → first name (active members and left members with marks) */
  firstNames: Map<string, string>;
};

export function pairKey(occurrenceId: string, membershipId: string): string {
  return `${occurrenceId}:${membershipId}`;
}

const RSVP_SHORT: Record<RsvpStatus, string> = { in: "In", out: "Out", no_reply: "—" };

/** "In", "Out", or "—" (no reply, or no row). */
export function rsvpShort(status: RsvpStatus | undefined): string {
  return status ? RSVP_SHORT[status] : "—";
}

export function hasStarted(occurrence: Pick<OccurrenceRow, "starts_at">, now: Date): boolean {
  return new Date(occurrence.starts_at).getTime() <= now.getTime();
}

async function load(loopId: string, durationMin: number, nowMs: number | undefined): Promise<SectionData> {
  const now = nowMs === undefined ? new Date() : new Date(nowMs);
  const supabase = await createServerSupabaseClient();

  const [occurrencesRes, membershipsRes, crewStatsRes] = await Promise.all([
    supabase.from("occurrence").select(OCCURRENCE_COLUMNS).eq("loop_id", loopId).order("starts_at"),
    supabase.from("membership").select(MEMBERSHIP_COLUMNS).eq("loop_id", loopId).order("tapped_in_at"),
    supabase.from("v_crew_stats").select(CREW_STATS_COLUMNS).eq("loop_id", loopId).order("formed_at"),
  ]);
  if (occurrencesRes.error) throw occurrencesRes.error;
  if (membershipsRes.error) throw membershipsRes.error;
  if (crewStatsRes.error) throw crewStatsRes.error;
  const occurrences = (occurrencesRes.data ?? []) as OccurrenceRow[];
  const memberships = (membershipsRes.data ?? []) as SectionMembership[];
  const crewStats = (crewStatsRes.data ?? []) as CrewStatsRow[];

  type Pair<S> = { occurrence_id: string; membership_id: string; status: S };
  const rsvpRows: Pair<RsvpStatus>[] = [];
  const attendanceRows: Pair<AttendanceMark>[] = [];
  for (const batch of chunks(occurrences.map((o) => o.id))) {
    const [rsvpRes, attendanceRes] = await Promise.all([
      supabase.from("rsvp").select("occurrence_id, membership_id, status").in("occurrence_id", batch),
      supabase.from("attendance").select("occurrence_id, membership_id, status").in("occurrence_id", batch),
    ]);
    if (rsvpRes.error) throw rsvpRes.error;
    if (attendanceRes.error) throw attendanceRes.error;
    rsvpRows.push(...((rsvpRes.data ?? []) as Pair<RsvpStatus>[]));
    attendanceRows.push(...((attendanceRes.data ?? []) as Pair<AttendanceMark>[]));
  }
  const rsvps = new Map(rsvpRows.map((r) => [pairKey(r.occurrence_id, r.membership_id), r.status]));
  const marks = new Map(attendanceRows.map((a) => [pairKey(a.occurrence_id, a.membership_id), a.status]));

  const markedMembershipIds = new Set(attendanceRows.map((a) => a.membership_id));
  const personIds = [
    ...new Set(
      memberships
        .filter((m) => m.left_at === null || markedMembershipIds.has(m.id))
        .map((m) => m.person_id),
    ),
  ];
  const firstNames = new Map<string, string>();
  if (personIds.length > 0) {
    const admin = createAdminClient();
    for (const batch of chunks(personIds)) {
      const { data, error } = await admin.from("person").select("id, first_name").in("id", batch);
      if (error) throw error;
      for (const p of (data ?? []) as Array<{ id: string; first_name: string | null }>) {
        firstNames.set(p.id, p.first_name ?? "(no name yet)");
      }
    }
  }

  const picked = pickNextOccurrence(
    occurrences.map((o) => ({ ...o, startsAt: new Date(o.starts_at) })),
    durationMin,
    now,
  );
  const next = picked ? (occurrences.find((o) => o.id === picked.id) ?? null) : null;

  return {
    now,
    occurrences,
    next,
    memberships,
    rsvps,
    marks,
    markedMembershipIds: [...markedMembershipIds],
    crewStats,
    firstNames,
  };
}

/** Deduplicated per request; `nowMs` is for tests (undefined = the current time). */
export const loadSectionData = cache(load);
