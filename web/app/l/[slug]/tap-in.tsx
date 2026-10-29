import { notFound, redirect } from "next/navigation";
import { getPerson } from "@/lib/auth";
import {
  DEFAULT_INTENT,
  RSVP_SOURCES,
  RSVP_SOURCE_LABELS,
  cleanDropToken,
  getLoopView,
  isSlug,
  parseIntent,
  parseRsvpSource,
  type Intent,
  type LoopView,
} from "@/lib/loops";
import { getLinkPreview, type LinkPreview } from "@/lib/linkPreview";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tapIn } from "@/app/l/[slug]/actions";
import { IntentPicker } from "@/app/l/[slug]/intent-picker";
import { LoopFactsBlock } from "@/app/l/[slug]/loop-facts";
import { completeTapIn, tapInNext } from "@/app/l/[slug]/membership";

export type Params = Promise<{ slug: string }>;
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const OTHER_CAMPUS = "This loop is for another campus. Your account is on a different one.";

/**
 * The public tap-in page body. Reads the loop through the service role with
 * explicit columns; the HTML carries no member names, counts, or drop labels,
 * with or without `?d=`.
 *
 * Signed-in members with an active membership go to their member page. A
 * signed-in, named person arriving with `?intent=` (the sign-in round trip)
 * has their tap-in completed here, then goes to the member page too.
 */
export async function TapIn({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const query = await searchParams;

  const admin = createAdminClient();
  const view = await getLoopView(admin, slug);
  if (!view) notFound();

  const dropToken = cleanDropToken(first(query.d));
  const roundTripIntent = parseIntent(first(query.intent));
  const rsvpSource = parseRsvpSource(first(query.src));
  let message: string | null =
    first(query.error) === "other_campus"
      ? OTHER_CAMPUS
      : first(query.left) === "1"
        ? "You've left this loop. Tap in again whenever you like."
        : null;

  const person = await getPerson();
  if (person) {
    const supabase = await createServerSupabaseClient();
    const { data: membership, error } = await supabase
      .from("membership")
      .select("id, left_at")
      .eq("loop_id", view.loop.id)
      .eq("person_id", person.id)
      .maybeSingle();
    if (error) throw error;
    if (membership && membership.left_at === null) redirect(`/l/${slug}/me`);

    const open = !view.ended && !view.cancelled;
    if (roundTripIntent && person.first_name === null && open) {
      // Signed in but unnamed: /welcome comes back to this exact URL, so the
      // write below completes with the same intent, drop and RSVP source.
      const back = tapInNext(slug, roundTripIntent, dropToken, rsvpSource);
      redirect(`/welcome?next=${encodeURIComponent(back)}`);
    }
    if (roundTripIntent && open) {
      const result = await completeTapIn(
        admin,
        person,
        view.loop,
        roundTripIntent,
        dropToken,
        rsvpSource,
      );
      if (result.ok) redirect(`/l/${slug}/me`);
      message = OTHER_CAMPUS;
    }
  }

  const preview = await getLinkPreview(admin, view.effectiveUrl);

  return (
    <TapInView
      view={view}
      preview={preview}
      intent={roundTripIntent ?? DEFAULT_INTENT}
      dropToken={dropToken ?? ""}
      message={message}
    />
  );
}

function TapInView({
  view,
  preview,
  intent,
  dropToken,
  message,
}: {
  view: LoopView;
  preview: LinkPreview | null;
  intent: Intent;
  /** The cleaned `?d=` token, or "" when absent or malformed; the action cleans it again. */
  dropToken: string;
  message: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <LoopFactsBlock view={view} preview={preview} />
      {message ? (
        <p role="alert" className="text-sm text-accent-strong">
          {message}
        </p>
      ) : null}
      {view.ended ? (
        <p className="text-secondary">This one already happened.</p>
      ) : view.cancelled ? null : (
        <form action={tapIn} className="flex flex-col gap-5">
          <input type="hidden" name="slug" value={view.loop.slug} />
          <input type="hidden" name="d" value={dropToken} />
          <IntentPicker initial={intent} />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Already RSVPed somewhere?</span>
            <select
              name="rsvp_source"
              defaultValue=""
              className="min-h-11 rounded-[var(--radius-md)] bg-sunken px-4 text-base text-primary"
            >
              <option value="">Optional</option>
              {RSVP_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {RSVP_SOURCE_LABELS[source]}
                </option>
              ))}
            </select>
          </label>
        </form>
      )}
    </div>
  );
}
