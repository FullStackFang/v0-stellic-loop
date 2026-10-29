import { randomBytes } from "node:crypto";
import { notFound } from "next/navigation";
import { requirePerson, type NamedPerson } from "@/lib/auth";
import {
  LOOP_PUBLIC_COLUMNS,
  RSVP_SOURCE_LABELS,
  RSVP_SOURCES,
  type LoopFacts,
  type RsvpSource,
} from "@/lib/loops";
import { instantForWallTime } from "@/lib/occurrences";
import { appUrl } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Organizer helpers: the `ORGANIZER_EMAILS` allowlist, the ownership gate for
 * `/org/[slug]`, and the server-side validators and URL builders the
 * organizer pages share. Server only (uses node:crypto); client components
 * import `@/lib/organizer-shared` instead.
 */

// Re-exported for existing importers (lib/reminders.ts); defined in lib/supabase/env.
export { appUrl };

/**
 * A `loop` row as the organizer pages read it: the public facts plus the
 * owner. Exactly one shape holds (a check constraint enforces it): weekly =
 * `weekday` + `start_local` set and `single_occurrence_at` null; one-off =
 * the reverse.
 */
export type Loop = LoopFacts & { organizer_id: string };

export const LOOP_COLUMNS = `${LOOP_PUBLIC_COLUMNS}, organizer_id`;

/** Count rows for "Taps-in by RSVP source", in display order; `null` = unanswered. */
export const RSVP_SOURCE_ROWS: ReadonlyArray<{ source: RsvpSource | null; label: string }> = [
  ...RSVP_SOURCES.map((source) => ({ source, label: RSVP_SOURCE_LABELS[source] })),
  { source: null, label: "Unanswered" },
];

export function rsvpSourceLabel(source: RsvpSource | null): string {
  return RSVP_SOURCE_ROWS.find((r) => r.source === source)?.label ?? String(source);
}

/**
 * True when `email` is on `ORGANIZER_EMAILS` (comma-separated). Comparison is
 * case-insensitive and ignores surrounding whitespace; an unset or empty
 * variable allows nobody.
 */
export function isAllowlistedOrganizer(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  const wanted = email.trim().toLowerCase();
  if (wanted === "") return false;
  return (process.env.ORGANIZER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s !== "")
    .includes(wanted);
}

/**
 * Gate for every organizer page and action of one loop. Requires a signed-in,
 * named person, reads the loop through RLS (which already hides loops the
 * caller neither organizes nor belongs to), and calls `notFound()` unless the
 * caller is its organizer. Ownership is by `organizer_id`, not the allowlist.
 */
export async function requireOrganizerOfLoop(
  slug: string,
): Promise<{ loop: Loop; person: NamedPerson }> {
  const person = await requirePerson(`/org/${slug}`);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("loop")
    .select(LOOP_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<Loop>();
  if (error) throw error;
  if (!data || data.organizer_id !== person.id) notFound();
  return { loop: data, person };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const SLUG_MAX = 48;

/** Route names under /org/ and /l/ that a slug must not shadow. */
const RESERVED_SLUGS = new Set(["new"]);

/**
 * The creation rule for a new slug: 1–48 lower-case letters, digits, and
 * single hyphens between them (`cs2110-thursdays`), and not a reserved route
 * name. `isSlug` in lib/loops.ts is deliberately looser: it only guards
 * lookups of an existing slug taken from a URL.
 */
export function isValidSlug(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug.length <= SLUG_MAX &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    !RESERVED_SLUGS.has(slug)
  );
}

/** 'HH:MM' (24-hour) from 'HH:MM' or 'HH:MM:00'; null for anything else. */
export function parseStartLocal(raw: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::00)?$/.exec(raw.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${m[2]}`;
}

/**
 * The instant at which a clock in `tz` shows the `datetime-local` value
 * `raw` ('YYYY-MM-DDTHH:MM'), or null when `raw` is malformed or names a
 * date that does not exist. DST follows `instantForWallTime`: a time in the
 * spring gap rolls forward an hour, the autumn overlap takes the earlier one.
 */
export function localDateTimeToInstant(raw: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const startLocal = parseStartLocal(m[4]);
  const dateUtc = new Date(Date.UTC(year, month - 1, day));
  const realDate =
    dateUtc.getUTCFullYear() === year &&
    dateUtc.getUTCMonth() === month - 1 &&
    dateUtc.getUTCDate() === day;
  if (startLocal === null || !realDate) return null;
  const [hour, minute] = startLocal.split(":").map(Number);
  return instantForWallTime({ year, month, day, hour, minute }, tz);
}

// ---------------------------------------------------------------------------
// Tokens and URLs
// ---------------------------------------------------------------------------

/** `bytes` random bytes as base64url (no padding): unguessable, URL-safe. */
export function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export function publicLoopUrl(slug: string): string {
  return `${appUrl()}/l/${slug}`;
}

export function dropUrl(slug: string, token: string): string {
  return `${publicLoopUrl(slug)}?d=${token}`;
}
