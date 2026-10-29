/**
 * Pure attendance rules shared by the grid (server), its cells (client), and
 * `setAttendance` (server action). No imports, so it is safe in the browser.
 */

export type AttendanceMark = "present" | "absent";

/** The tap cycle: unmarked → present → absent → unmarked. */
export function nextMark(current: AttendanceMark | null): AttendanceMark | null {
  if (current === null) return "present";
  if (current === "present") return "absent";
  return null;
}

/**
 * True when an occurrence starting at `startsAt` falls in the member's crew
 * window [crewed_at, left_at), the same pairs `v_crew_stats` counts. False
 * for a member never crewed.
 */
export function inCrewWindow(
  startsAt: string,
  membership: { crewed_at: string | null; left_at: string | null },
): boolean {
  if (membership.crewed_at === null) return false;
  const start = new Date(startsAt).getTime();
  if (start < new Date(membership.crewed_at).getTime()) return false;
  return membership.left_at === null || start < new Date(membership.left_at).getTime();
}
