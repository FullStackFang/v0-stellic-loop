import "server-only";
import { chunks } from "@/lib/chunks";
import { sendEmail } from "@/lib/email";
import { placementEmail } from "@/lib/emails/placement";
import { formatMeeting, formatSlot, getNextOccurrence, type AdminClient } from "@/lib/loops";
import { appUrl, publicLoopUrl } from "@/lib/organizer";

/**
 * Sends the placement notice to each member a confirmed formation placed
 * (crew-formation "Members are told when placed"). Reads through the service
 * role with explicit columns: the placed memberships, the active roster of
 * each of their crews, those people's first names and emails, then the loop,
 * campus zone, organizer first name and next occurrence. Each recipient's
 * email names only their own crew.
 *
 * Never throws: placements are already committed, so a failed read counts
 * every requested member as failed, and a failed send counts that one.
 */

export interface PlacementSendResult {
  sent: number;
  failed: number;
  /** First names of failed recipients, when known, so the organizer can tell them in person. */
  failedFirstNames: string[];
}

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
type MembershipRow = { id: string; person_id: string; crew_id: string | null };
type PersonRow = { id: string; first_name: string | null; email: string };

const LOOP_COLUMNS =
  "id, slug, title, organizer_id, campus_id, weekday, start_local, duration_min, place, linked_url";

function check<T extends { error: unknown }>(res: T, what: string): T {
  if (res.error) {
    const message = (res.error as { message?: string }).message ?? String(res.error);
    throw new Error(`sendPlacementEmails: ${what}: ${message}`);
  }
  return res;
}

export async function sendPlacementEmails(
  db: AdminClient,
  loopId: string,
  membershipIds: string[],
  now: Date = new Date(),
): Promise<PlacementSendResult> {
  const result: PlacementSendResult = { sent: 0, failed: 0, failedFirstNames: [] };
  if (membershipIds.length === 0) return result;

  let prepared: Awaited<ReturnType<typeof prepare>>;
  try {
    prepared = await prepare(db, loopId, membershipIds, now);
  } catch (err) {
    console.error("sendPlacementEmails: could not load recipients", err);
    return { sent: 0, failed: membershipIds.length, failedFirstNames: [] };
  }

  for (const id of membershipIds) {
    try {
      const message = prepared.render(id);
      if (!message) throw new Error(`no active crewed membership or person for ${id}`);
      await sendEmail(message);
      result.sent++;
    } catch (err) {
      console.error(`placement email failed for membership ${id}`, err);
      result.failed++;
      const name = prepared.firstNameOf(id);
      if (name) result.failedFirstNames.push(name);
    }
  }
  return result;
}

async function prepare(db: AdminClient, loopId: string, membershipIds: string[], now: Date) {
  const loopRes = check(
    await db.from("loop").select(LOOP_COLUMNS).eq("id", loopId).maybeSingle<LoopRow>(),
    "loop",
  );
  const loop = loopRes.data;
  if (!loop) throw new Error(`no loop ${loopId}`);

  const placedRows: MembershipRow[] = [];
  for (const batch of chunks(membershipIds)) {
    const res = check(
      await db
        .from("membership")
        .select("id, person_id, crew_id")
        .eq("loop_id", loopId)
        .is("left_at", null)
        .in("id", batch),
      "placed memberships",
    );
    placedRows.push(...((res.data ?? []) as MembershipRow[]));
  }
  const placed = new Map(placedRows.map((m) => [m.id, m]));
  const crewIds = [...new Set([...placed.values()].map((m) => m.crew_id).filter((c): c is string => c !== null))];

  // Each batch is ordered by tap-in; batches split by crew, so a crew never spans two.
  const roster: MembershipRow[] = [];
  for (const batch of chunks(crewIds)) {
    const res = check(
      await db
        .from("membership")
        .select("id, person_id, crew_id")
        .eq("loop_id", loopId)
        .is("left_at", null)
        .in("crew_id", batch)
        .order("tapped_in_at", { ascending: true }),
      "crew rosters",
    );
    roster.push(...((res.data ?? []) as MembershipRow[]));
  }

  const personIds = [...new Set([...roster, ...placed.values()].map((m) => m.person_id))];
  const peopleRows: PersonRow[] = [];
  for (const batch of chunks(personIds)) {
    const res = check(await db.from("person").select("id, first_name, email").in("id", batch), "persons");
    peopleRows.push(...((res.data ?? []) as PersonRow[]));
  }
  const [campusRes, organizerRes, next] = await Promise.all([
    db.from("campus").select("tz").eq("id", loop.campus_id).maybeSingle<{ tz: string }>(),
    db.from("person").select("first_name").eq("id", loop.organizer_id).maybeSingle<{ first_name: string | null }>(),
    getNextOccurrence(db, loop.id, loop.duration_min, now),
  ]);
  check(campusRes, "campus");
  check(organizerRes, "organizer");
  const tz = campusRes.data?.tz;
  if (!tz) throw new Error(`no campus row for ${loop.campus_id}`);

  const people = new Map(peopleRows.map((p) => [p.id, p]));
  const base = appUrl();
  const facts = {
    loopTitle: loop.title,
    organizerFirstName: organizerRes.data?.first_name ?? "the organizer",
    loopUrl: publicLoopUrl(loop.slug),
    leaveUrl: `${base}/l/${loop.slug}/leave`,
    memberUrl: `${base}/l/${loop.slug}/me`,
    whenLabel: next ? formatMeeting(next.starts_at, tz) : null,
    slotLabel: formatSlot(loop),
    place: loop.place,
    linkedUrl: next?.linked_url ?? loop.linked_url ?? null,
  };

  return {
    firstNameOf(membershipId: string): string | null {
      const m = placed.get(membershipId);
      return (m ? people.get(m.person_id)?.first_name : null) ?? null;
    },
    /** The message for one placed membership, or null when it has no crew or person. */
    render(membershipId: string) {
      const m = placed.get(membershipId);
      const person = m ? people.get(m.person_id) : undefined;
      if (!m || m.crew_id === null || !person) return null;
      const crew = roster
        .filter((r) => r.crew_id === m.crew_id)
        .flatMap((r) => {
          const firstName = people.get(r.person_id)?.first_name;
          const isYou = r.id === m.id;
          if (firstName) return [{ firstName, isYou }];
          return isYou ? [{ firstName: "You", isYou: false }] : [];
        });
      return { to: person.email, ...placementEmail({ ...facts, crew }) };
    },
  };
}
