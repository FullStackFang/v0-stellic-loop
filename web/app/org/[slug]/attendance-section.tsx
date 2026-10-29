import { Fragment } from "react";
import type { Loop } from "@/lib/organizer";
import { AttendanceCell } from "@/app/org/[slug]/attendance-cell";
import { inCrewWindow } from "@/app/org/[slug]/attendance-rules";
import { SectionShell } from "@/app/org/[slug]/section-shell";
import {
  hasStarted,
  loadSectionData,
  pairKey,
  rsvpShort,
  type SectionMembership,
} from "@/app/org/[slug]/sections-data";

function shortDate(startsAt: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(
    new Date(startsAt),
  );
}

/**
 * Crew members × started, non-cancelled occurrences, grouped by crew. Rows
 * are active crew members plus members who left but have marks. A cell inside
 * the member's crew window [crewed_at, left_at) shows the RSVP and the mark
 * and cycles unmarked → present → absent → unmarked; outside it, the RSVP
 * only. The next upcoming occurrence is shown last with RSVPs and no button.
 * Call only after `requireOrganizerOfLoop`.
 */
export async function AttendanceSection({ loop, tz, now }: { loop: Loop; tz: string; now?: Date }) {
  const data = await loadSectionData(loop.id, loop.duration_min, now?.getTime());
  const columns = data.occurrences.filter((o) => !o.cancelled && hasStarted(o, data.now));
  const upcoming = data.occurrences.find((o) => !o.cancelled && !hasStarted(o, data.now)) ?? null;
  const markedIds = new Set(data.markedMembershipIds);
  const crewed = data.memberships.filter(
    (m) => m.crew_id !== null && (m.left_at === null || markedIds.has(m.id)),
  );

  // Group by crew: crews in v_crew_stats order (formed_at), then any others.
  const crewOrder = [
    ...new Set([...data.crewStats.map((c) => c.crew_id), ...crewed.map((m) => m.crew_id as string)]),
  ];
  const groups = crewOrder
    .map((crewId) => ({ crewId, members: crewed.filter((m) => m.crew_id === crewId) }))
    .filter((g) => g.members.length > 0);
  const columnCount = 1 + columns.length + (upcoming ? 1 : 0);

  const rsvpOnly = (text: string, attr: Record<string, string>) => (
    <div {...attr} className="flex min-h-11 flex-col items-center justify-center text-xs text-tertiary">
      {text}
    </div>
  );

  const memberRow = (m: SectionMembership) => {
    const firstName = data.firstNames.get(m.person_id) ?? "(no name yet)";
    return (
      <tr key={m.id} data-membership-id={m.id}>
        <th scope="row" className="whitespace-nowrap pr-2 text-left font-semibold">
          {firstName}
          {m.left_at !== null ? <span className="font-normal text-tertiary"> (left)</span> : null}
        </th>
        {columns.map((o) => {
          const key = pairKey(o.id, m.id);
          const mark = data.marks.get(key) ?? null;
          const rsvp = rsvpShort(data.rsvps.get(key));
          return (
            <td key={o.id} className="min-w-16">
              {inCrewWindow(o.starts_at, m) ? (
                <AttendanceCell
                  key={`${key}:${mark ?? "none"}`}
                  slug={loop.slug}
                  occurrenceId={o.id}
                  membershipId={m.id}
                  mark={mark}
                  rsvp={rsvp}
                  who={`${firstName}, ${shortDate(o.starts_at, tz)}`}
                />
              ) : (
                rsvpOnly(rsvp, { "data-outside-window": "" })
              )}
            </td>
          );
        })}
        {upcoming ? (
          <td className="min-w-16">
            {rsvpOnly(rsvpShort(data.rsvps.get(pairKey(upcoming.id, m.id))), { "data-upcoming-cell": "" })}
          </td>
        ) : null}
      </tr>
    );
  };

  return (
    <SectionShell title="Attendance">
      {groups.length === 0 ? (
        <p className="text-sm text-tertiary">No crew members yet.</p>
      ) : columns.length === 0 && upcoming === null ? (
        <p className="text-sm text-tertiary">No meetings yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                <th scope="col" className="text-left text-xs font-semibold text-tertiary">
                  Member
                </th>
                {columns.map((o) => (
                  <th key={o.id} scope="col" className="pls-mono text-xs font-semibold">
                    {shortDate(o.starts_at, tz)}
                  </th>
                ))}
                {upcoming ? (
                  <th scope="col" className="pls-mono text-xs font-normal text-tertiary">
                    {shortDate(upcoming.starts_at, tz)} <span className="sr-only">(not started)</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.crewId}>
                  <tr data-crew-group={g.crewId}>
                    <td colSpan={columnCount} className="pls-mono pt-2 text-xs text-tertiary">
                      crew {g.crewId.slice(0, 8)}
                    </td>
                  </tr>
                  {g.members.map(memberRow)}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-tertiary">
        Each cell shows the RSVP, then the mark. Tap to cycle present → absent → unmarked. Marking opens
        once a meeting starts, and only while the member is in the crew.
      </p>
    </SectionShell>
  );
}
