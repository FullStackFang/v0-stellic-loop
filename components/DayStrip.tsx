"use client";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { setFreeDay, setProposalDay } from "@/actions/days";
import { dayNum, dow } from "@/lib/days";
import { useToast } from "./Toast";

/**
 * The window's days, seven to a row. `boardId` toggles your free days;
 * `proposalId` adjusts your days on that proposal alone. Days before `today`
 * are struck through and do nothing.
 */
export function DayStrip({ days, selected, today, boardId, proposalId, compact }: { days: string[]; selected: string[]; today: string; boardId?: string; proposalId?: string; compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [sel, flip] = useOptimistic(selected, (cur: string[], day: string) => (cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day]));

  function toggle(day: string) {
    const on = !sel.includes(day);
    start(async () => {
      flip(day);
      const r = proposalId ? await setProposalDay({ proposalId, day, on }) : await setFreeDay({ boardId: boardId!, day, free: on });
      if (r.status === "error") toast(r.message);
      router.refresh();
    });
  }

  return (
    <div className={`days${compact ? " compact" : ""}`} role="group" aria-label={proposalId ? "Your days for this one" : "Your free days"}>
      {days.map((d) => {
        if (d < today) {
          return (
            <button key={d} className="day busy" aria-disabled="true">
              <span className="d">{dow(d)}</span>
              <span className="num">{dayNum(d)}</span>
              {compact ? null : <span className="src" />}
            </button>
          );
        }
        const on = sel.includes(d);
        return (
          <button key={d} className={`day${on ? " free" : ""}`} aria-pressed={on} onClick={() => toggle(d)}>
            <span className="d">{dow(d)}</span>
            <span className="num">{dayNum(d)}</span>
            {compact ? null : <span className="src">{on ? "free" : ""}</span>}
          </button>
        );
      })}
    </div>
  );
}
