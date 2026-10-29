import type { AdminClient } from "@/lib/loops";
import type { RsvpStatus } from "@/lib/signedLink";

/**
 * The one RSVP write (occurrence-rsvp "RSVP is per crewed member per
 * occurrence", "RSVP closes with the occurrence"). Shared by the member
 * page's buttons, the undo banner, and the signed one-tap link handler, so
 * every path refuses the same cases: an uncrewed or departed member, an
 * occurrence of another loop, a cancelled one, or one that has ended.
 *
 * Always called with the service-role client after the caller has decided
 * who is acting (session, or a verified signed link), per design.md "Data
 * access rule" 5 and 7.
 */

export type RsvpRefusal =
  | "membership_not_found"
  | "left"
  | "uncrewed"
  | "occurrence_not_found"
  | "wrong_loop"
  | "cancelled"
  | "ended"
  | "error";

export type SetRsvpResult = { ok: true } | { ok: false; reason: RsvpRefusal };

export interface SetRsvpInput {
  membershipId: string;
  occurrenceId: string;
  status: RsvpStatus;
  now: Date;
}

type MembershipRow = { id: string; loop_id: string; crew_id: string | null; left_at: string | null };
type OccurrenceRow = { id: string; loop_id: string; starts_at: string; cancelled: boolean };

/**
 * Records `status` for exactly that (occurrence, membership) pair, replacing
 * any earlier answer and stamping `responded_at = now`. Never throws: a
 * refusal names its reason, and a database failure reads as `error`.
 */
export async function setRsvp(db: AdminClient, input: SetRsvpInput): Promise<SetRsvpResult> {
  try {
    return await write(db, input);
  } catch (err) {
    console.error("setRsvp failed", err);
    return { ok: false, reason: "error" };
  }
}

async function write(db: AdminClient, input: SetRsvpInput): Promise<SetRsvpResult> {
  const { membershipId, occurrenceId, status, now } = input;

  const membership = await db
    .from("membership")
    .select("id, loop_id, crew_id, left_at")
    .eq("id", membershipId)
    .maybeSingle<MembershipRow>();
  if (membership.error) throw membership.error;
  if (!membership.data) return { ok: false, reason: "membership_not_found" };
  if (membership.data.left_at !== null) return { ok: false, reason: "left" };
  if (membership.data.crew_id === null) return { ok: false, reason: "uncrewed" };

  const occurrence = await db
    .from("occurrence")
    .select("id, loop_id, starts_at, cancelled")
    .eq("id", occurrenceId)
    .maybeSingle<OccurrenceRow>();
  if (occurrence.error) throw occurrence.error;
  if (!occurrence.data) return { ok: false, reason: "occurrence_not_found" };
  if (occurrence.data.loop_id !== membership.data.loop_id) return { ok: false, reason: "wrong_loop" };
  if (occurrence.data.cancelled) return { ok: false, reason: "cancelled" };

  const loop = await db
    .from("loop")
    .select("duration_min")
    .eq("id", occurrence.data.loop_id)
    .maybeSingle<{ duration_min: number }>();
  if (loop.error) throw loop.error;
  if (!loop.data) return { ok: false, reason: "occurrence_not_found" };
  const endsAt = new Date(occurrence.data.starts_at).getTime() + loop.data.duration_min * 60_000;
  if (endsAt <= now.getTime()) return { ok: false, reason: "ended" };

  const { error } = await db.from("rsvp").upsert(
    {
      occurrence_id: occurrenceId,
      membership_id: membershipId,
      status,
      responded_at: now.toISOString(),
    },
    { onConflict: "occurrence_id,membership_id" },
  );
  if (error) throw error;
  return { ok: true };
}

/**
 * The "Marked you as In for Thursday" undo: flips the answer a signed link
 * just recorded (`status` is the one that was marked). Same checks as
 * `setRsvp`, so an undo after the meeting ended is refused like any write.
 */
export function undoRsvp(db: AdminClient, input: SetRsvpInput): Promise<SetRsvpResult> {
  return setRsvp(db, { ...input, status: input.status === "in" ? "out" : "in" });
}

/** The stored answer, or `no_reply` when the member has not answered. */
export async function getRsvpStatus(
  db: AdminClient,
  membershipId: string,
  occurrenceId: string,
): Promise<"in" | "out" | "no_reply"> {
  const { data, error } = await db
    .from("rsvp")
    .select("status")
    .eq("membership_id", membershipId)
    .eq("occurrence_id", occurrenceId)
    .maybeSingle<{ status: "in" | "out" | "no_reply" }>();
  if (error) throw error;
  return data?.status ?? "no_reply";
}

/** Slug of the loop a membership belongs to, for redirecting to its member page. Null when unknown. */
export async function getMembershipLoopSlug(
  db: AdminClient,
  membershipId: string,
): Promise<string | null> {
  const membership = await db
    .from("membership")
    .select("loop_id")
    .eq("id", membershipId)
    .maybeSingle<{ loop_id: string }>();
  if (membership.error) throw membership.error;
  if (!membership.data) return null;
  const loop = await db
    .from("loop")
    .select("slug")
    .eq("id", membership.data.loop_id)
    .maybeSingle<{ slug: string }>();
  if (loop.error) throw loop.error;
  return loop.data?.slug ?? null;
}
