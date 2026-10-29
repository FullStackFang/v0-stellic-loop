"use client";

import { useState, useTransition } from "react";
import { nextMark, type AttendanceMark } from "@/app/org/[slug]/attendance-rules";
import { setAttendance } from "@/app/org/[slug]/sections-actions";

const MARK_LABELS: Record<"none" | AttendanceMark, string> = {
  none: "Unmarked",
  present: "Present",
  absent: "Absent",
};

/**
 * One grid cell's tap target: from the mark it shows, asks the server to set
 * the next one in the cycle unmarked → present → absent → unmarked.
 */
export function AttendanceCell({
  slug,
  occurrenceId,
  membershipId,
  mark,
  rsvp,
  who,
}: {
  slug: string;
  occurrenceId: string;
  membershipId: string;
  mark: AttendanceMark | null;
  /** "In", "Out", or "—". */
  rsvp: string;
  /** "Sarah, Oct 15" for the accessible name. */
  who: string;
}) {
  const [current, setCurrent] = useState<AttendanceMark | null>(mark);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = MARK_LABELS[current ?? "none"];
  const action = failed ? "Couldn't save, tap to retry." : "Tap to change.";

  return (
    <button
      type="button"
      aria-label={`${who}: ${label}, RSVP ${rsvp}. ${action}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setAttendance(slug, occurrenceId, membershipId, nextMark(current));
          if (result.status === "ok") {
            setCurrent(result.mark);
            setFailed(false);
          } else {
            setFailed(true);
          }
        })
      }
      className="flex min-h-11 w-full flex-col items-center justify-center rounded-[var(--radius-md)] bg-sunken px-2 text-xs"
    >
      <span className="text-tertiary">{rsvp}</span>
      <span className={current === "present" ? "font-semibold text-primary" : "text-secondary"}>
        {current === null ? "·" : label}
      </span>
      {failed ? <span className="text-accent-strong">!</span> : null}
    </button>
  );
}
