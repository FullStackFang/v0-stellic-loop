import type { Loop } from "@/lib/organizer";
import { SectionShell } from "@/app/org/[slug]/section-shell";
import { loadSectionData, pairKey, rsvpShort } from "@/app/org/[slug]/sections-data";

/**
 * Each crew from `v_crew_stats` (read through RLS, organizer policy) with its
 * active members' RSVPs for this week's occurrence and the view's flags and
 * counts. Call only after `requireOrganizerOfLoop`.
 */
export async function CrewsSection({ loop, now }: { loop: Loop; now?: Date }) {
  const data = await loadSectionData(loop.id, loop.duration_min, now?.getTime());
  const active = data.memberships.filter((m) => m.left_at === null);

  return (
    <SectionShell title="Crews" count={data.crewStats.length}>
      {data.crewStats.length === 0 ? (
        <p className="text-sm text-tertiary">No crews yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {data.crewStats.map((c) => {
            const members = active.filter((m) => m.crew_id === c.crew_id);
            const present = Number(c.present);
            const denominator = Number(c.denominator);
            return (
              <li key={c.crew_id} data-crew-id={c.crew_id} className="flex flex-col gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="pls-mono font-semibold">{c.crew_id.slice(0, 8)}</span>
                  <span className="text-xs text-secondary">{c.anchored ? "anchored" : "not anchored"}</span>
                  <span className="text-xs text-secondary">{c.single_drop ? "single drop" : "mixed"}</span>
                  <span className="text-xs text-secondary">
                    {c.reached_third ? "3rd meeting ✓" : `met ${Number(c.met_count)}×`}
                  </span>
                </div>
                {members.length === 0 ? (
                  <p className="text-xs text-tertiary">No active members.</p>
                ) : (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {members.map((m) => (
                      <li key={m.id}>
                        <span>{data.firstNames.get(m.person_id) ?? "(no name yet)"}</span>{" "}
                        <span className="text-xs text-tertiary">
                          {data.next ? rsvpShort(data.rsvps.get(pairKey(data.next.id, m.id))) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
                  <dt className="text-tertiary">Show-up</dt>
                  <dd>
                    <span className="pls-mono">{`${present} of ${denominator}`}</span>
                    {denominator > 0 ? (
                      <span className="text-tertiary"> · {Math.round((present / denominator) * 100)}%</span>
                    ) : null}
                  </dd>
                  <dt className="text-tertiary">Said In → came</dt>
                  <dd className="pls-mono">{`${Number(c.said_in)} → ${Number(c.said_in_and_came)}`}</dd>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-tertiary">
        RSVPs are for this week&apos;s meeting. Show-up counts only meetings with at least one mark.
      </p>
    </SectionShell>
  );
}
