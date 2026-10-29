/**
 * Loop and occurrence reads shared by the tap-in page, the member page, and
 * the membership actions. Every select names its columns (design.md "Data
 * access rule": never `select('*')` through the service role).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { pickNextOccurrence } from "@/lib/occurrences";

export type AdminClient = ReturnType<typeof createAdminClient>;

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

export type Intent = "crew_conditional" | "going_want_crew" | "watching";

export const INTENTS: readonly Intent[] = ["crew_conditional", "going_want_crew", "watching"];

export const DEFAULT_INTENT: Intent = "crew_conditional";

/** Button and option copy, fixed by loop-membership-intent "Tap-in requires one intent". */
export const INTENT_LABELS: Record<Intent, string> = {
  crew_conditional: "In if there's a crew",
  going_want_crew: "Going anyway, add me to a crew",
  watching: "Keep me in the loop",
};

export function parseIntent(raw: unknown): Intent | null {
  return typeof raw === "string" && (INTENTS as readonly string[]).includes(raw)
    ? (raw as Intent)
    : null;
}

// ---------------------------------------------------------------------------
// RSVP source (organizer-only; asked once on tap-in, never shown to members)
// ---------------------------------------------------------------------------

export type RsvpSource = "luma" | "partiful" | "campusgroups" | "other" | "none";

export const RSVP_SOURCES: readonly RsvpSource[] = [
  "luma",
  "partiful",
  "campusgroups",
  "other",
  "none",
];

export const RSVP_SOURCE_LABELS: Record<RsvpSource, string> = {
  luma: "Luma",
  partiful: "Partiful",
  campusgroups: "CampusGroups",
  other: "Other",
  none: "None",
};

/** Null when unanswered (blank option) or junk; the dropdown is optional. */
export function parseRsvpSource(raw: unknown): RsvpSource | null {
  return typeof raw === "string" && (RSVP_SOURCES as readonly string[]).includes(raw)
    ? (raw as RsvpSource)
    : null;
}

/** Slugs are URL path segments we echo into redirects, so keep them plain. */
export function isSlug(raw: unknown): raw is string {
  return typeof raw === "string" && /^[a-z0-9][a-z0-9-]{0,62}$/i.test(raw);
}

/** A drop token as it may travel in `?d=` and in `next`: no whitespace, no control characters. */
export function cleanDropToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const token = raw.trim();
  if (token === "" || token.length > 128 || /[\s\u0000-\u001f\u007f]/.test(token)) return null;
  return token;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** What the public tap-in page may show of a loop. Nothing about members. */
export const LOOP_PUBLIC_COLUMNS =
  "id, slug, title, weekday, start_local, single_occurrence_at, duration_min, place, linked_url, campus_id";

export const OCCURRENCE_COLUMNS = "id, starts_at, linked_url, cancelled";

export type LoopFacts = {
  id: string;
  slug: string;
  title: string;
  /** ISO weekday: 1 = Monday … 7 = Sunday (0001_schema.sql). Null for a one-off loop. */
  weekday: number | null;
  /** Postgres `time`, 'HH:MM:SS' or 'HH:MM'. Null for a one-off loop. */
  start_local: string | null;
  /** Set instead of the weekly slot for a one-off loop, which has exactly one occurrence. */
  single_occurrence_at: string | null;
  duration_min: number;
  place: string;
  linked_url: string | null;
  campus_id: string;
};

export type OccurrenceRow = {
  id: string;
  starts_at: string;
  linked_url: string | null;
  cancelled: boolean;
};

export type LoopView = {
  loop: LoopFacts;
  tz: string;
  next: OccurrenceRow | null;
  /** Occurrence override when the next occurrence has one, else the loop default. */
  effectiveUrl: string | null;
  /** A one-off loop whose only occurrence has ended: nothing to offer beyond leaving. */
  ended: boolean;
  /** A one-off loop whose only occurrence is cancelled and not yet past: no tap-in, no intent. */
  cancelled: boolean;
};

export function isOneOff(loop: Pick<LoopFacts, "single_occurrence_at">): boolean {
  return loop.single_occurrence_at !== null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getLoopBySlug(admin: AdminClient, slug: string): Promise<LoopFacts | null> {
  const { data, error } = await admin
    .from("loop")
    .select(LOOP_PUBLIC_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as LoopFacts | null) ?? null;
}

export async function getLoopById(admin: AdminClient, id: string): Promise<LoopFacts | null> {
  const { data, error } = await admin
    .from("loop")
    .select(LOOP_PUBLIC_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as LoopFacts | null) ?? null;
}

async function getCampusTz(admin: AdminClient, campusId: string): Promise<string> {
  const { data, error } = await admin
    .from("campus")
    .select("tz")
    .eq("id", campusId)
    .maybeSingle();
  if (error) throw error;
  const tz = (data as { tz: string } | null)?.tz;
  if (!tz) throw new Error(`No campus row for ${campusId}`);
  return tz;
}

/**
 * The loop's occurrences that have not ended yet (started ones included while
 * the meeting runs), oldest first. `pickNextOccurrence` applies the cancelled
 * and during-the-meeting rules on top.
 */
async function listPendingOccurrences(
  admin: AdminClient,
  loopId: string,
  durationMin: number,
  now: Date,
): Promise<OccurrenceRow[]> {
  const since = new Date(now.getTime() - durationMin * 60_000).toISOString();
  const { data, error } = await admin
    .from("occurrence")
    .select(OCCURRENCE_COLUMNS)
    .eq("loop_id", loopId)
    .gte("starts_at", since)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data as OccurrenceRow[] | null) ?? [];
}

function pickNext(rows: OccurrenceRow[], durationMin: number, now: Date): OccurrenceRow | null {
  const picked = pickNextOccurrence(
    rows.map((row) => ({ ...row, startsAt: new Date(row.starts_at) })),
    durationMin,
    now,
  );
  if (!picked) return null;
  const { startsAt: _startsAt, ...row } = picked;
  void _startsAt;
  return row;
}

export async function getNextOccurrence(
  admin: AdminClient,
  loopId: string,
  durationMin: number,
  now: Date = new Date(),
): Promise<OccurrenceRow | null> {
  const rows = await listPendingOccurrences(admin, loopId, durationMin, now);
  return pickNext(rows, durationMin, now);
}

/** Everything the public page and the member page's facts block need. */
export async function getLoopView(
  admin: AdminClient,
  slug: string,
  now: Date = new Date(),
): Promise<LoopView | null> {
  const loop = await getLoopBySlug(admin, slug);
  if (!loop) return null;
  const [tz, rows] = await Promise.all([
    getCampusTz(admin, loop.campus_id),
    listPendingOccurrences(admin, loop.id, loop.duration_min, now),
  ]);
  const next = pickNext(rows, loop.duration_min, now);
  // A one-off has exactly one occurrence. It has ended once its start plus
  // duration is past (cancelled or not); before that, no pickable occurrence
  // and a cancelled row mean it is cancelled.
  const ended =
    loop.single_occurrence_at !== null &&
    new Date(loop.single_occurrence_at).getTime() + loop.duration_min * 60_000 <= now.getTime();
  const cancelled = isOneOff(loop) && !ended && next === null && rows.some((row) => row.cancelled);
  return {
    loop,
    tz,
    next,
    effectiveUrl: next?.linked_url ?? loop.linked_url ?? null,
    ended,
    cancelled,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "Thursdays" for ISO weekday 4 (1 = Monday … 7 = Sunday). */
export function weekdayPlural(weekday: number): string {
  const name = WEEKDAY_NAMES[weekday];
  return name ? `${name}s` : "Weekly";
}

/** "Thursdays · 7:00 PM" when the loop has a weekly slot; null for a one-off loop. */
export function formatSlot(loop: Pick<LoopFacts, "weekday" | "start_local">): string | null {
  if (loop.weekday === null || loop.start_local === null) return null;
  return `${weekdayPlural(loop.weekday)} · ${formatStartLocal(loop.start_local)}`;
}

/** "7:00 PM" for '19:00:00'. */
export function formatStartLocal(startLocal: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(startLocal);
  if (!m) return startLocal;
  const hour24 = Number(m[1]);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${m[2]} ${hour24 < 12 ? "AM" : "PM"}`;
}

/** "Thu, Oct 22, 7:00 PM" in the campus zone. */
export function formatMeeting(startsAt: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startsAt));
}
