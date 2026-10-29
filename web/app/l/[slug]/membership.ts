/**
 * Membership writes, shared by the server actions and by the tap-in page's
 * sign-in round trip. Every function takes the service-role client and
 * assumes the caller has already checked the session and ownership
 * (design.md "Data access rule" 7). No "use server" here: these are plain
 * server-side functions, not endpoints.
 */

import {
  getNextOccurrence,
  type AdminClient,
  type Intent,
  type LoopFacts,
  type RsvpSource,
} from "@/lib/loops";

export type MembershipRow = {
  id: string;
  loop_id: string;
  person_id: string;
  intent: Intent;
  tapped_in_at: string;
  crewed_at: string | null;
  crew_id: string | null;
  left_at: string | null;
  drop_id: string | null;
  rsvp_source: RsvpSource | null;
};

const MEMBERSHIP_COLUMNS =
  "id, loop_id, person_id, intent, tapped_in_at, crewed_at, crew_id, left_at, drop_id, rsvp_source";

export type TapInResult = { ok: true } | { ok: false; reason: "other_campus" };

export async function findMembership(
  admin: AdminClient,
  loopId: string,
  personId: string,
): Promise<MembershipRow | null> {
  const { data, error } = await admin
    .from("membership")
    .select(MEMBERSHIP_COLUMNS)
    .eq("loop_id", loopId)
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw error;
  return (data as MembershipRow | null) ?? null;
}

/** The membership only if it belongs to `personId`; null otherwise (ownership check). */
export async function getOwnedMembership(
  admin: AdminClient,
  membershipId: string,
  personId: string,
): Promise<MembershipRow | null> {
  const { data, error } = await admin
    .from("membership")
    .select(MEMBERSHIP_COLUMNS)
    .eq("id", membershipId)
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw error;
  return (data as MembershipRow | null) ?? null;
}

/** `drop.id` for a token of this loop; null for no token or no match (never an error). */
async function resolveDrop(
  admin: AdminClient,
  loopId: string,
  token: string | null,
): Promise<string | null> {
  if (!token) return null;
  const { data, error } = await admin
    .from("drop")
    .select("id")
    .eq("loop_id", loopId)
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

async function appendHistory(
  admin: AdminClient,
  membershipId: string,
  prevIntent: Intent | null,
  newIntent: Intent,
  loop: Pick<LoopFacts, "id" | "duration_min">,
  now: Date,
): Promise<void> {
  const next = await getNextOccurrence(admin, loop.id, loop.duration_min, now);
  const { error } = await admin.from("intent_history").insert({
    membership_id: membershipId,
    prev_intent: prevIntent,
    new_intent: newIntent,
    occurrence_id: next?.id ?? null,
    changed_at: now.toISOString(),
  });
  if (error) throw error;
}

/**
 * The one tap-in path. First tap-in inserts the membership (intent, tap-in
 * time, drop, RSVP source) once; an existing active membership becomes an
 * intent change (plus the RSVP source when answered); a left membership is
 * reactivated. `drop_id` and `tapped_in_at` are never rewritten.
 */
export async function completeTapIn(
  admin: AdminClient,
  person: { id: string; campus_id: string },
  loop: Pick<LoopFacts, "id" | "campus_id" | "duration_min">,
  intent: Intent,
  dropToken: string | null,
  rsvpSource: RsvpSource | null,
  now: Date = new Date(),
): Promise<TapInResult> {
  if (person.campus_id !== loop.campus_id) return { ok: false, reason: "other_campus" };

  const existing = await findMembership(admin, loop.id, person.id);
  if (existing) {
    await updateExisting(admin, existing, intent, loop, now, rsvpSource);
    return { ok: true };
  }

  const dropId = await resolveDrop(admin, loop.id, dropToken);
  const { data, error } = await admin
    .from("membership")
    .insert({
      loop_id: loop.id,
      person_id: person.id,
      intent,
      tapped_in_at: now.toISOString(),
      drop_id: dropId,
      rsvp_source: rsvpSource,
    })
    .select("id")
    .single();
  if (error) {
    // A concurrent first tap-in (double submit, two tabs) won the unique
    // (loop_id, person_id) race: treat this one as a re-tap of that row.
    if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
    const winner = await findMembership(admin, loop.id, person.id);
    if (!winner) throw error;
    await updateExisting(admin, winner, intent, loop, now, rsvpSource);
    return { ok: true };
  }
  await appendHistory(admin, (data as { id: string }).id, null, intent, loop, now);
  return { ok: true };
}

const UNIQUE_VIOLATION = "23505";

async function updateExisting(
  admin: AdminClient,
  existing: MembershipRow,
  intent: Intent,
  loop: Pick<LoopFacts, "id" | "duration_min">,
  now: Date,
  rsvpSource: RsvpSource | null,
): Promise<void> {
  if (existing.left_at !== null) {
    await reactivate(admin, existing, intent, loop, now, rsvpSource);
  } else {
    await changeIntent(admin, existing, intent, loop, now, rsvpSource);
  }
}

/**
 * Sets the standing intent; crew, drop and tap-in time stay untouched. The
 * same intent again writes nothing and records no history, except that an
 * answered RSVP source is still stored.
 */
export async function changeIntent(
  admin: AdminClient,
  membership: MembershipRow,
  intent: Intent,
  loop: Pick<LoopFacts, "id" | "duration_min">,
  now: Date = new Date(),
  rsvpSource: RsvpSource | null = null,
): Promise<void> {
  const changed = intent !== membership.intent;
  const patch: { intent?: Intent; rsvp_source?: RsvpSource } = {};
  if (changed) patch.intent = intent;
  if (rsvpSource !== null) patch.rsvp_source = rsvpSource;
  if (Object.keys(patch).length === 0) return;
  const { error } = await admin.from("membership").update(patch).eq("id", membership.id);
  if (error) throw error;
  if (changed) await appendHistory(admin, membership.id, membership.intent, intent, loop, now);
}

/**
 * Marks the membership left. `crew_id` stays so past attendance remains
 * attributed. No history row: leaving is recorded by `left_at`, not by an
 * intent value.
 */
export async function leave(
  admin: AdminClient,
  membership: MembershipRow,
  now: Date = new Date(),
): Promise<void> {
  const { error } = await admin
    .from("membership")
    .update({ left_at: now.toISOString() })
    .eq("id", membership.id)
    // Only an active row: a double submit must not move left_at later.
    .is("left_at", null);
  if (error) throw error;
}

/** Reactivates a left membership with no crew; the original drop is kept. */
export async function reactivate(
  admin: AdminClient,
  membership: MembershipRow,
  intent: Intent,
  loop: Pick<LoopFacts, "id" | "duration_min">,
  now: Date = new Date(),
  rsvpSource: RsvpSource | null = null,
): Promise<void> {
  const patch: {
    intent: Intent;
    crew_id: null;
    crewed_at: null;
    left_at: null;
    rsvp_source?: RsvpSource;
  } = { intent, crew_id: null, crewed_at: null, left_at: null };
  if (rsvpSource !== null) patch.rsvp_source = rsvpSource;
  const { error } = await admin.from("membership").update(patch).eq("id", membership.id);
  if (error) throw error;
  await appendHistory(admin, membership.id, membership.intent, intent, loop, now);
}

/** The `next` a signed-out tap-in carries through sign-in and /welcome. */
export function tapInNext(
  slug: string,
  intent: Intent,
  dropToken: string | null,
  rsvpSource: RsvpSource | null,
): string {
  const params = new URLSearchParams({ intent });
  if (dropToken) params.set("d", dropToken);
  if (rsvpSource) params.set("src", rsvpSource);
  return `/l/${slug}?${params.toString()}`;
}
