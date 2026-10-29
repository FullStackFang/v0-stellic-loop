"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizerOfLoop } from "@/lib/organizer";
import { parseHttpUrl } from "@/lib/organizer-shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { inCrewWindow, type AttendanceMark } from "@/app/org/[slug]/attendance-rules";

/**
 * Occurrence and attendance writes. Each one first checks with the session
 * that the caller organizes the loop named by `slug` (404 otherwise, before
 * any admin call), then writes with the admin client filtered by both the row
 * id and that loop's id, so a row of another loop is never touched.
 */

export type OccurrenceUrlState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message: string };

export type CancelOccurrenceState =
  | { status: "idle" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export type SetAttendanceResult =
  | { status: "ok"; mark: AttendanceMark | null }
  | { status: "error"; message: string };

const GENERIC_RETRY = "We couldn't save that just now. Try again.";
const NOT_THIS_LOOP = "That occurrence is not part of this loop.";
const NOT_EDITABLE = "That meeting's link can't be edited: it has started or was cancelled.";
const ALREADY_STARTED = "That meeting has already started, so it can't be cancelled.";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

type OccurrenceFacts = { id: string; starts_at: string; cancelled: boolean };

/**
 * Sets or clears (empty) one upcoming, non-cancelled occurrence's linked URL
 * override. http(s) only. The lookup tells an occurrence of another loop
 * apart; the update itself carries the not-cancelled and not-started
 * conditions, so zero matched rows there means "not editable".
 */
export async function setOccurrenceUrl(
  _prev: OccurrenceUrlState,
  formData: FormData,
): Promise<OccurrenceUrlState> {
  const slug = field(formData, "slug");
  const { loop } = await requireOrganizerOfLoop(slug);

  const occurrenceId = field(formData, "occurrence_id");
  if (occurrenceId === "") return { status: "error", message: NOT_THIS_LOOP };
  const raw = field(formData, "linked_url");
  const linkedUrl = raw === "" ? null : parseHttpUrl(raw);
  if (raw !== "" && linkedUrl === null) {
    return { status: "error", message: "The link must start with http:// or https://." };
  }

  const admin = createAdminClient();
  const { data: occurrence, error: lookupError } = await admin
    .from("occurrence")
    .select("id")
    .eq("id", occurrenceId)
    .eq("loop_id", loop.id)
    .maybeSingle<{ id: string }>();
  if (lookupError) return { status: "error", message: GENERIC_RETRY };
  if (!occurrence) return { status: "error", message: NOT_THIS_LOOP };

  const { data, error } = await admin
    .from("occurrence")
    .update({ linked_url: linkedUrl })
    .eq("id", occurrenceId)
    .eq("loop_id", loop.id)
    .eq("cancelled", false)
    .gt("starts_at", new Date().toISOString())
    .select("id");
  if (error) return { status: "error", message: GENERIC_RETRY };
  if (!data || data.length === 0) return { status: "error", message: NOT_EDITABLE };

  revalidatePath(`/org/${slug}`);
  return { status: "saved" };
}

/**
 * Cancels a future occurrence of this loop. One that has started is refused,
 * both by the lookup and by the update's own `starts_at > now` condition.
 */
export async function cancelOccurrence(
  _prev: CancelOccurrenceState,
  formData: FormData,
): Promise<CancelOccurrenceState> {
  const slug = field(formData, "slug");
  const { loop } = await requireOrganizerOfLoop(slug);

  const occurrenceId = field(formData, "occurrence_id");
  if (occurrenceId === "") return { status: "error", message: NOT_THIS_LOOP };

  const admin = createAdminClient();
  const { data: occurrence, error } = await admin
    .from("occurrence")
    .select("id, starts_at, cancelled")
    .eq("id", occurrenceId)
    .eq("loop_id", loop.id)
    .maybeSingle<OccurrenceFacts>();
  if (error) return { status: "error", message: GENERIC_RETRY };
  if (!occurrence) return { status: "error", message: NOT_THIS_LOOP };
  if (new Date(occurrence.starts_at).getTime() <= Date.now()) {
    return { status: "error", message: ALREADY_STARTED };
  }
  if (occurrence.cancelled) return { status: "cancelled" };

  const { data: updated, error: updateError } = await admin
    .from("occurrence")
    .update({ cancelled: true })
    .eq("id", occurrenceId)
    .eq("loop_id", loop.id)
    .gt("starts_at", new Date().toISOString())
    .select("id");
  if (updateError) return { status: "error", message: GENERIC_RETRY };
  if (!updated || updated.length === 0) return { status: "error", message: ALREADY_STARTED };

  revalidatePath(`/org/${slug}`);
  return { status: "cancelled" };
}

type MembershipFacts = {
  id: string;
  crew_id: string | null;
  crewed_at: string | null;
  left_at: string | null;
};

const MARKS: ReadonlyArray<AttendanceMark | null> = ["present", "absent", null];

/**
 * Sets one crew member's mark for one started, non-cancelled occurrence that
 * falls inside their crew window [crewed_at, left_at). `null` clears it. The
 * occurrence and membership are verified to belong to the organizer's loop
 * before any write.
 */
export async function setAttendance(
  slug: string,
  occurrenceId: string,
  membershipId: string,
  mark: AttendanceMark | null,
): Promise<SetAttendanceResult> {
  const { loop } = await requireOrganizerOfLoop(slug);
  if (!MARKS.includes(mark)) return { status: "error", message: "Unknown mark." };

  const admin = createAdminClient();
  const [occurrenceRes, membershipRes] = await Promise.all([
    admin
      .from("occurrence")
      .select("id, starts_at, cancelled")
      .eq("id", occurrenceId)
      .eq("loop_id", loop.id)
      .maybeSingle<OccurrenceFacts>(),
    admin
      .from("membership")
      .select("id, crew_id, crewed_at, left_at")
      .eq("id", membershipId)
      .eq("loop_id", loop.id)
      .maybeSingle<MembershipFacts>(),
  ]);
  if (occurrenceRes.error || membershipRes.error) return { status: "error", message: GENERIC_RETRY };
  const occurrence = occurrenceRes.data;
  const membership = membershipRes.data;
  if (!occurrence) return { status: "error", message: NOT_THIS_LOOP };
  if (!membership) return { status: "error", message: "That member is not part of this loop." };
  if (occurrence.cancelled) return { status: "error", message: "That meeting was cancelled." };
  if (new Date(occurrence.starts_at).getTime() > Date.now()) {
    return { status: "error", message: "Attendance opens once the meeting starts." };
  }
  if (membership.crew_id === null) {
    return { status: "error", message: "Only crew members are marked." };
  }
  if (!inCrewWindow(occurrence.starts_at, membership)) {
    return { status: "error", message: "That meeting is outside this member's time in the crew." };
  }

  const { error: writeError } =
    mark === null
      ? await admin
          .from("attendance")
          .delete()
          .eq("occurrence_id", occurrenceId)
          .eq("membership_id", membershipId)
      : await admin.from("attendance").upsert(
          {
            occurrence_id: occurrenceId,
            membership_id: membershipId,
            status: mark,
            marked_at: new Date().toISOString(),
          },
          { onConflict: "occurrence_id,membership_id" },
        );
  if (writeError) return { status: "error", message: GENERIC_RETRY };

  revalidatePath(`/org/${slug}`);
  return { status: "ok", mark };
}
