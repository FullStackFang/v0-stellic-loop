import { chunks } from "@/lib/chunks";
import { sendEmail } from "@/lib/email";
import { reminderEmail } from "@/lib/emails/reminder";
import { formatMeeting, formatSlot, type AdminClient } from "@/lib/loops";
import { appUrl, publicLoopUrl } from "@/lib/organizer";
import { signRsvpLink, type RsvpStatus } from "@/lib/signedLink";
import { required } from "@/lib/supabase/env";

/**
 * The day-before reminder job (meeting-reminder spec; design.md "Cron via
 * Vercel Cron"). For every non-cancelled occurrence starting 12 to 36 hours
 * from `now` (half-open, so a once-daily run sees each occurrence exactly once), every active crewed member of its loop who has no
 * `reminder_send` row for that occurrence gets one email.
 *
 * Idempotency: the `reminder_send` row is inserted with ON CONFLICT DO
 * NOTHING before the email goes out, and a member whose insert affected no
 * row is skipped, so a re-run or a concurrent run cannot send twice. When a
 * send fails, that row is removed again so the next run can retry it.
 */

export const REMINDER_WINDOW_START_H = 12;
export const REMINDER_WINDOW_END_H = 36;

const HOUR_MS = 60 * 60 * 1000;

type OccurrenceRow = { id: string; loop_id: string; starts_at: string; linked_url: string | null };
type LoopRow = {
  id: string;
  slug: string;
  title: string;
  organizer_id: string;
  campus_id: string;
  weekday: number | null;
  start_local: string | null;
  duration_min: number;
  place: string;
  linked_url: string | null;
};
type MembershipRow = { id: string; person_id: string; crew_id: string };
type PersonRow = { id: string; first_name: string | null; email: string };

export interface ReminderRunResult {
  sent: number;
  /** Already reminded (by an earlier or concurrent run). */
  skipped: number;
  /** Sends Resend rejected; their rows were released for the next run. */
  failed: number;
  /** Occurrences whose processing threw (logged); the others still ran. */
  failedOccurrences: number;
}

/** "2026-10-21": the calendar date of `date` in `tz`. */
function localDate(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "7:00 PM" in `tz`. */
function formatTimeOnly(startsAt: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

export async function sendReminders(db: AdminClient, now: Date): Promise<ReminderRunResult> {
  const secret = required("REMINDER_LINK_SECRET", process.env.REMINDER_LINK_SECRET);
  const base = appUrl();
  const result: ReminderRunResult = { sent: 0, skipped: 0, failed: 0, failedOccurrences: 0 };

  const windowStart = new Date(now.getTime() + REMINDER_WINDOW_START_H * HOUR_MS).toISOString();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_END_H * HOUR_MS).toISOString();
  const occurrences = await db
    .from("occurrence")
    .select("id, loop_id, starts_at, linked_url")
    .eq("cancelled", false)
    .gte("starts_at", windowStart)
    .lt("starts_at", windowEnd)
    .order("starts_at", { ascending: true });
  if (occurrences.error) throw occurrences.error;

  for (const occurrence of (occurrences.data ?? []) as OccurrenceRow[]) {
    try {
      await remindOccurrence(db, occurrence, { secret, base, now }, result);
    } catch (err) {
      console.error(`reminders failed for occurrence ${occurrence.id}`, err);
      result.failedOccurrences++;
    }
  }
  return result;
}

async function remindOccurrence(
  db: AdminClient,
  occurrence: OccurrenceRow,
  ctx: { secret: string; base: string; now: Date },
  result: ReminderRunResult,
): Promise<void> {
  const loop = await db
    .from("loop")
    .select(
      "id, slug, title, organizer_id, campus_id, weekday, start_local, duration_min, place, linked_url",
    )
    .eq("id", occurrence.loop_id)
    .maybeSingle<LoopRow>();
  if (loop.error) throw loop.error;
  if (!loop.data) return;

  const members = await db
    .from("membership")
    .select("id, person_id, crew_id")
    .eq("loop_id", loop.data.id)
    .is("left_at", null)
    .not("crew_id", "is", null);
  if (members.error) throw members.error;
  const memberships = (members.data ?? []) as MembershipRow[];
  if (memberships.length === 0) return;

  const [campus, organizer, peopleBatches, reminded, ins] = await Promise.all([
    db.from("campus").select("tz").eq("id", loop.data.campus_id).maybeSingle<{ tz: string }>(),
    db
      .from("person")
      .select("first_name")
      .eq("id", loop.data.organizer_id)
      .maybeSingle<{ first_name: string | null }>(),
    Promise.all(
      chunks(memberships.map((m) => m.person_id)).map((batch) =>
        db.from("person").select("id, first_name, email").in("id", batch),
      ),
    ),
    db.from("reminder_send").select("membership_id").eq("occurrence_id", occurrence.id),
    db
      .from("rsvp")
      .select("membership_id")
      .eq("occurrence_id", occurrence.id)
      .eq("status", "in"),
  ]);
  for (const r of [campus, organizer, ...peopleBatches, reminded, ins]) if (r.error) throw r.error;
  const tz = campus.data?.tz;
  if (!tz) throw new Error(`No campus row for ${loop.data.campus_id}`);

  const personById = new Map(
    peopleBatches.flatMap((people) => (people.data ?? []) as PersonRow[]).map((p) => [p.id, p]),
  );
  const alreadyReminded = new Set(
    ((reminded.data ?? []) as { membership_id: string }[]).map((r) => r.membership_id),
  );
  const inMembershipIds = new Set(
    ((ins.data ?? []) as { membership_id: string }[]).map((r) => r.membership_id),
  );

  const crewNames = new Map<string, string[]>();
  const crewInCount = new Map<string, number>();
  for (const m of memberships) {
    const name = personById.get(m.person_id)?.first_name;
    if (name) crewNames.set(m.crew_id, [...(crewNames.get(m.crew_id) ?? []), name]);
    if (inMembershipIds.has(m.id)) {
      crewInCount.set(m.crew_id, (crewInCount.get(m.crew_id) ?? 0) + 1);
    }
  }

  const facts = {
    loopTitle: loop.data.title,
    organizerFirstName: organizer.data?.first_name ?? "the organizer",
    loopUrl: publicLoopUrl(loop.data.slug),
    leaveUrl: `${ctx.base}/l/${loop.data.slug}/leave`,
    whenLabel: formatMeeting(occurrence.starts_at, tz),
    timeLabel: formatTimeOnly(occurrence.starts_at, tz),
    dayWord:
      localDate(ctx.now, tz) === localDate(new Date(occurrence.starts_at), tz)
        ? ("Tonight" as const)
        : ("Tomorrow" as const),
    slotLabel: formatSlot(loop.data),
    place: loop.data.place,
    linkedUrl: occurrence.linked_url ?? loop.data.linked_url ?? null,
  };

  for (const m of memberships) {
    if (alreadyReminded.has(m.id)) {
      result.skipped++;
      continue;
    }
    const person = personById.get(m.person_id);
    if (!person) continue;

    const claimed = await claimReminder(db, m.id, occurrence.id, ctx.now);
    if (!claimed) {
      result.skipped++;
      continue;
    }

    // Signing and rendering sit inside the try so any throw after the claim
    // releases it, never leaving a claimed-but-unsent row.
    try {
      const link = (status: RsvpStatus) =>
        `${ctx.base}/r/${signRsvpLink(
          { membershipId: m.id, occurrenceId: occurrence.id, status },
          ctx.secret,
          ctx.now,
        )}`;
      const rendered = reminderEmail({
        ...facts,
        crewFirstNames: crewNames.get(m.crew_id) ?? [],
        inCount: crewInCount.get(m.crew_id) ?? 0,
        inUrl: link("in"),
        outUrl: link("out"),
      });
      await sendEmail({ to: person.email, ...rendered });
      result.sent++;
    } catch (err) {
      console.error(`reminder send failed for membership ${m.id}`, err);
      result.failed++;
      await releaseReminder(db, m.id, occurrence.id);
    }
  }
}

/** True when this run inserted the `reminder_send` row; false when it already existed. */
async function claimReminder(
  db: AdminClient,
  membershipId: string,
  occurrenceId: string,
  now: Date,
): Promise<boolean> {
  const { data, error } = await db
    .from("reminder_send")
    .upsert(
      { membership_id: membershipId, occurrence_id: occurrenceId, sent_at: now.toISOString() },
      { onConflict: "membership_id,occurrence_id", ignoreDuplicates: true },
    )
    .select("membership_id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function releaseReminder(
  db: AdminClient,
  membershipId: string,
  occurrenceId: string,
): Promise<void> {
  const { error } = await db
    .from("reminder_send")
    .delete()
    .eq("membership_id", membershipId)
    .eq("occurrence_id", occurrenceId);
  if (error) console.error(`could not release reminder_send for ${membershipId}`, error);
}
