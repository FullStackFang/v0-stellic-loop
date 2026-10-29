import { formatMeeting } from "@/lib/loops";
import type { Loop } from "@/lib/organizer";
import { isPartifulUrl } from "@/lib/organizer-shared";
import { CancelOccurrenceButton } from "@/app/org/[slug]/cancel-occurrence-button";
import { OccurrenceUrlForm } from "@/app/org/[slug]/occurrence-url-form";
import { SectionShell } from "@/app/org/[slug]/section-shell";
import { hasStarted, loadSectionData, pairKey } from "@/app/org/[slug]/sections-data";

/** How many started occurrences to list above the upcoming ones. */
const RECENT_COUNT = 4;

/**
 * Upcoming and recent occurrences in the campus zone: the In count from
 * active members' RSVPs, a link override for each upcoming one (Partiful note
 * when the effective link is on partiful.com), and Cancel for upcoming ones.
 * Call only after `requireOrganizerOfLoop`.
 */
export async function OccurrencesSection({ loop, tz, now }: { loop: Loop; tz: string; now?: Date }) {
  const data = await loadSectionData(loop.id, loop.duration_min, now?.getTime());
  const activeIds = data.memberships.filter((m) => m.left_at === null).map((m) => m.id);
  const started = data.occurrences.filter((o) => hasStarted(o, data.now));
  const upcoming = data.occurrences.filter((o) => !hasStarted(o, data.now));
  const rows = [...started.slice(-RECENT_COUNT), ...upcoming];

  return (
    <SectionShell title="Occurrences">
      {rows.length === 0 ? (
        <p className="text-sm text-tertiary">No occurrences yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {rows.map((o) => {
            const when = formatMeeting(o.starts_at, tz);
            const isUpcoming = !hasStarted(o, data.now);
            const inCount = activeIds.filter((id) => data.rsvps.get(pairKey(o.id, id)) === "in").length;
            const effectiveUrl = o.linked_url ?? loop.linked_url;
            return (
              <li
                key={o.id}
                data-occurrence-id={o.id}
                className="flex flex-col gap-2 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={o.cancelled ? "font-semibold text-tertiary line-through" : "font-semibold"}>
                      {when}
                    </span>
                    {o.cancelled ? (
                      <span className="pls-kicker">Cancelled</span>
                    ) : (
                      <span className="text-xs text-tertiary">
                        {data.next?.id === o.id ? "this week" : isUpcoming ? "upcoming" : "past"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {o.cancelled ? null : (
                      <span className="text-secondary">
                        <span className="pls-mono font-semibold text-primary">{inCount}</span> In
                      </span>
                    )}
                    {isUpcoming && !o.cancelled ? (
                      <CancelOccurrenceButton slug={loop.slug} occurrenceId={o.id} when={when} />
                    ) : null}
                  </div>
                </div>
                {isUpcoming && !o.cancelled ? (
                  <OccurrenceUrlForm
                    slug={loop.slug}
                    occurrenceId={o.id}
                    linkedUrl={o.linked_url}
                    defaultUrl={loop.linked_url}
                    partifulNote={isPartifulUrl(effectiveUrl)}
                    label={`Link for ${when}`}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-tertiary">
        Leave a link empty to use the loop&apos;s default link that week.
      </p>
    </SectionShell>
  );
}
