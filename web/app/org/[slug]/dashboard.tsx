import {
  formatMeeting,
  formatSlot,
  isOneOff,
  type Intent,
  type RsvpSource,
} from "@/lib/loops";
import {
  dropUrl,
  publicLoopUrl,
  requireOrganizerOfLoop,
  RSVP_SOURCE_ROWS,
  rsvpSourceLabel,
} from "@/lib/organizer";
import {
  dropKindLabel,
  INTENT_GROUPS,
  isPartifulUrl,
  type DropKind,
} from "@/lib/organizer-shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AddDropForm } from "@/app/org/[slug]/add-drop-form";
import { CopyButton } from "@/app/org/[slug]/copy-button";
import { FormCrews } from "@/app/org/[slug]/form-crews";
import { RemoveMemberButton } from "@/app/org/[slug]/remove-member-button";
import { SettingsForm } from "@/app/org/[slug]/settings-form";
import { AttendanceSection } from "@/app/org/[slug]/attendance-section";
import { CrewsSection } from "@/app/org/[slug]/crews-section";
import { OccurrencesSection } from "@/app/org/[slug]/occurrences-section";
import { SectionShell } from "@/app/org/[slug]/section-shell";

export type Params = Promise<{ slug: string }>;
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type MembershipRow = {
  id: string;
  person_id: string;
  intent: Intent;
  tapped_in_at: string;
  crew_id: string | null;
  drop_id: string | null;
  left_at: string | null;
  rsvp_source: RsvpSource | null;
};

type DropRow = { id: string; token: string; label: string; kind: DropKind };

type PersonRow = { id: string; first_name: string | null; email: string };

const MEMBERSHIP_COLUMNS =
  "id, person_id, intent, tapped_in_at, crew_id, drop_id, left_at, rsvp_source";

/**
 * Organizer dashboard shell. Ownership is checked first; memberships and
 * drops are then read through RLS (organizer policies), and only the members'
 * `person` rows and the campus zone come from the service role (design rule 3).
 */
export async function DashboardGate({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const justCreated = (await searchParams).created === "1";
  const { loop } = await requireOrganizerOfLoop(slug);

  const supabase = await createServerSupabaseClient();
  const [membershipsRes, dropsRes] = await Promise.all([
    supabase
      .from("membership")
      .select(MEMBERSHIP_COLUMNS)
      .eq("loop_id", loop.id)
      .order("tapped_in_at"),
    supabase.from("drop").select("id, token, label, kind").eq("loop_id", loop.id).order("created_at"),
  ]);
  if (membershipsRes.error) throw membershipsRes.error;
  if (dropsRes.error) throw dropsRes.error;
  const memberships = (membershipsRes.data ?? []) as MembershipRow[];
  const drops = (dropsRes.data ?? []) as DropRow[];
  const active = memberships.filter((m) => m.left_at === null);

  const admin = createAdminClient();
  const personIds = [...new Set(active.map((m) => m.person_id))];
  const [personsRes, campusRes] = await Promise.all([
    personIds.length === 0
      ? Promise.resolve({ data: [] as PersonRow[], error: null })
      : admin.from("person").select("id, first_name, email").in("id", personIds),
    admin.from("campus").select("tz").eq("id", loop.campus_id).maybeSingle<{ tz: string }>(),
  ]);
  if (personsRes.error) throw personsRes.error;
  if (campusRes.error) throw campusRes.error;
  const persons = new Map(((personsRes.data ?? []) as PersonRow[]).map((p) => [p.id, p]));
  if (!campusRes.data) throw new Error(`No campus row for ${loop.campus_id}`);
  const tz = campusRes.data.tz;
  const dropsById = new Map(drops.map((d) => [d.id, d]));

  const waiting = active.filter(
    (m) => m.crew_id === null && INTENT_GROUPS.some((g) => g.intent === m.intent && g.eligible),
  ).length;

  const publicUrl = publicLoopUrl(loop.slug);
  const when =
    formatSlot(loop) ??
    (loop.single_occurrence_at ? formatMeeting(loop.single_occurrence_at, tz) : "unscheduled");
  const slot = `${when} · ${loop.duration_min} min`;

  return (
    <>
      <header className="flex flex-col gap-3">
        <span className="pls-kicker">Organizer</span>
        <h1 className="pls-display text-4xl font-bold leading-tight">{loop.title}</h1>
        <p className="text-secondary">{`${slot} · ${loop.place}`}</p>
        {justCreated ? (
          <p role="status" className="rounded-[var(--radius-md)] bg-blush px-4 py-3 text-sm">
            Your loop is live. Share the link below.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Public link</span>
          <a href={publicUrl} className="pls-mono break-all text-sm text-link">
            {publicUrl}
          </a>
          <CopyButton text={publicUrl} />
        </div>
      </header>

      <SectionShell title="Members by intent" count={active.length}>
        <p className="text-sm text-secondary">
          <span className="pls-mono font-semibold text-primary">{waiting}</span> waiting for a crew
        </p>
        {INTENT_GROUPS.map((group) => {
          const rows = active.filter((m) => m.intent === group.intent);
          return (
            <div key={group.intent} className="flex flex-col gap-2">
              <h3 className="text-base font-semibold">
                {group.label} <span className="pls-mono text-tertiary">· {rows.length}</span>
              </h3>
              {rows.length === 0 ? (
                <p className="text-sm text-tertiary">Nobody yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline">
                  {rows.map((m) => {
                    const person = persons.get(m.person_id);
                    const firstName = person?.first_name ?? "(no name yet)";
                    return (
                      <li
                        key={m.id}
                        className="grid grid-cols-[1fr_auto] items-center gap-3 py-2 text-sm"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold">{firstName}</span>
                          <span className="pls-mono text-xs text-secondary">
                            {person?.email ?? m.person_id}
                          </span>
                          <span className="text-xs text-tertiary">
                            tapped in {formatMeeting(m.tapped_in_at, tz)}
                            {" · via "}
                            {m.drop_id ? (dropsById.get(m.drop_id)?.label ?? "unknown drop") : "no drop"}
                            {" · crew "}
                            {m.crew_id ? <span className="pls-mono">{m.crew_id.slice(0, 8)}</span> : "—"}
                            {" · RSVP source "}
                            {rsvpSourceLabel(m.rsvp_source)}
                          </span>
                        </div>
                        <RemoveMemberButton slug={loop.slug} membershipId={m.id} firstName={firstName} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </SectionShell>

      <div className="grid gap-8 sm:grid-cols-2">
        <SectionShell title="Taps-in by drop">
          <CountList
            rows={[
              ...drops.map((d) => ({
                key: d.id,
                label: d.label,
                count: memberships.filter((m) => m.drop_id === d.id).length,
              })),
              {
                key: "none",
                label: "no drop",
                count: memberships.filter((m) => m.drop_id === null).length,
              },
            ]}
          />
        </SectionShell>
        <SectionShell title="Taps-in by RSVP source">
          <CountList
            rows={RSVP_SOURCE_ROWS.map((r) => ({
              key: r.source ?? "unanswered",
              label: r.label,
              count: memberships.filter((m) => m.rsvp_source === r.source).length,
            }))}
          />
        </SectionShell>
      </div>

      <SectionShell title="Settings">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-tertiary">{isOneOff(loop) ? "One date" : "Meets"}</dt>
          <dd>{slot}</dd>
          <dt className="text-tertiary">Link</dt>
          <dd className="pls-mono">/l/{loop.slug}</dd>
        </dl>
        <p className="text-xs text-tertiary">The weekday and time can&apos;t change in this version.</p>
        <SettingsForm
          slug={loop.slug}
          place={loop.place}
          linkedUrl={loop.linked_url}
          partifulNote={isPartifulUrl(loop.linked_url)}
        />
        <div className="flex flex-col gap-3 border-t border-hairline pt-4">
          <h3 className="text-base font-semibold">Drops</h3>
          {drops.length === 0 ? (
            <p className="text-sm text-tertiary">No drops yet. Each one is a share link you can tell apart.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {drops.map((d) => {
                const url = dropUrl(loop.slug, d.token);
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{d.label}</span>
                    <span className="text-tertiary">{dropKindLabel(d.kind)}</span>
                    <span className="pls-mono break-all text-xs text-secondary">{url}</span>
                    <CopyButton text={url} />
                  </li>
                );
              })}
            </ul>
          )}
          <AddDropForm slug={loop.slug} />
        </div>
      </SectionShell>

      <FormCrews slug={loop.slug} waiting={waiting} />
      {await OccurrencesSection({ loop, tz })}
      {await AttendanceSection({ loop, tz })}
      {await CrewsSection({ loop })}
    </>
  );
}

function CountList({ rows }: { rows: Array<{ key: string; label: string; count: number }> }) {
  return (
    <ul className="flex flex-col divide-y divide-hairline text-sm">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center justify-between py-1.5">
          <span>{r.label}</span>
          <span className="pls-mono font-semibold">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}
