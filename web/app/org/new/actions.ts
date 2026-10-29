"use server";

import { notFound, redirect } from "next/navigation";
import { requirePerson } from "@/lib/auth";
import { nextWeeklyStarts } from "@/lib/occurrences";
import {
  isAllowlistedOrganizer,
  isValidSlug,
  localDateTimeToInstant,
  parseStartLocal,
  randomToken,
  SLUG_MAX,
} from "@/lib/organizer";
import { parseHttpUrl } from "@/lib/organizer-shared";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreateLoopState = { status: "idle" } | { status: "error"; message: string };

const TITLE_MAX = 80;
const PLACE_MAX = 120;
const DURATION_MIN = 15;
const DURATION_MAX = 480;
/** Occurrences materialized at creation for a weekly loop (design.md). */
const WEEKS_AHEAD = 4;

const SLUG_TAKEN = "that link is taken";
const GENERIC_RETRY = "We couldn't create the loop just now. Try again.";
const PG_UNIQUE_VIOLATION = "23505";

function error(message: string): CreateLoopState {
  return { status: "error", message };
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/**
 * Creates a loop owned by the signed-in, allowlisted organizer: the `loop`
 * row, its `loop_secret`, and its occurrences (the next 4 for a weekly loop,
 * exactly one for a one-off). Redirects to the dashboard on success.
 */
export async function createLoop(
  _prev: CreateLoopState,
  formData: FormData,
): Promise<CreateLoopState> {
  const person = await requirePerson("/org/new");
  if (!isAllowlistedOrganizer(person.email)) notFound();

  const title = field(formData, "title").replace(/\s+/g, " ");
  if (title === "") return error("Give the loop a title.");
  if (title.length > TITLE_MAX) return error(`Keep the title under ${TITLE_MAX} characters.`);

  const durationMin = Number(field(formData, "duration_min"));
  if (!Number.isInteger(durationMin) || durationMin < DURATION_MIN || durationMin > DURATION_MAX) {
    return error(`Duration must be ${DURATION_MIN}–${DURATION_MAX} minutes.`);
  }

  const place = field(formData, "place").replace(/\s+/g, " ");
  if (place === "") return error("Say where it meets.");
  if (place.length > PLACE_MAX) return error(`Keep the place under ${PLACE_MAX} characters.`);

  const slug = field(formData, "slug").toLowerCase();
  if (!isValidSlug(slug)) {
    return error(
      `The link can use lower-case letters, digits, and hyphens, up to ${SLUG_MAX} characters.`,
    );
  }

  const linkedRaw = field(formData, "linked_url");
  const linkedUrl = linkedRaw === "" ? null : parseHttpUrl(linkedRaw);
  if (linkedRaw !== "" && linkedUrl === null) {
    return error("The event link must start with http:// or https://.");
  }

  const schedule = field(formData, "schedule") === "once" ? "once" : "weekly";
  let weekday: number | null = null;
  let startLocal: string | null = null;
  if (schedule === "weekly") {
    weekday = Number(field(formData, "weekday"));
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return error("Pick a weekday.");
    startLocal = parseStartLocal(field(formData, "start_local"));
    if (startLocal === null) return error("Enter a start time.");
  }

  const admin = createAdminClient();

  const { data: campus, error: campusError } = await admin
    .from("campus")
    .select("tz")
    .eq("id", person.campus_id)
    .maybeSingle<{ tz: string }>();
  if (campusError) throw campusError;
  if (!campus) throw new Error(`No campus row ${person.campus_id} for person ${person.id}`);

  let starts: Date[];
  let singleOccurrenceAt: string | null = null;
  if (schedule === "weekly") {
    starts = nextWeeklyStarts(
      { weekday: weekday as number, startLocal: startLocal as string, durationMin, tz: campus.tz },
      new Date(),
      WEEKS_AHEAD,
    );
  } else {
    const instant = localDateTimeToInstant(field(formData, "starts_at"), campus.tz);
    if (instant === null) return error("Enter the date and time.");
    if (instant.getTime() <= Date.now()) return error("Pick a date and time in the future.");
    starts = [instant];
    singleOccurrenceAt = instant.toISOString();
  }

  // Friendly check first; the unique index still decides the race below.
  const { data: existing, error: existingError } = await admin
    .from("loop")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (existingError) throw existingError;
  if (existing) return error(SLUG_TAKEN);

  const { data: loop, error: insertError } = await admin
    .from("loop")
    .insert({
      campus_id: person.campus_id,
      organizer_id: person.id,
      slug,
      title,
      weekday,
      start_local: startLocal,
      single_occurrence_at: singleOccurrenceAt,
      duration_min: durationMin,
      place,
      linked_url: linkedUrl,
    })
    .select("id")
    .single<{ id: string }>();
  if (insertError) {
    if (insertError.code === PG_UNIQUE_VIOLATION) return error(SLUG_TAKEN);
    return error(GENERIC_RETRY);
  }

  const { error: secretError } = await admin
    .from("loop_secret")
    .insert({ loop_id: loop.id, ics_token: randomToken(32) });
  const { error: occurrenceError } = secretError
    ? { error: secretError }
    : await admin
        .from("occurrence")
        .insert(starts.map((d) => ({ loop_id: loop.id, starts_at: d.toISOString() })));
  if (secretError || occurrenceError) {
    // No transaction across PostgREST calls: undo the loop (cascades) so a
    // half-created loop never holds the slug.
    const { error: deleteError } = await admin.from("loop").delete().eq("id", loop.id);
    if (deleteError) {
      console.error(`createLoop: could not undo half-created loop ${loop.id}`, deleteError);
    }
    return error(GENERIC_RETRY);
  }

  redirect(`/org/${slug}?created=1`);
}
