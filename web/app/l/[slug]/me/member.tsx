import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { requirePerson } from "@/lib/auth";
import { getLoopView, isSlug, type Intent, type LoopView } from "@/lib/loops";
import { getLinkPreview, type LinkPreview } from "@/lib/linkPreview";
import type { RsvpStatus } from "@/lib/signedLink";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  setIntentForm,
  setRsvpForm,
  undoMarkedForm,
  type ActionErrorCode,
} from "@/app/l/[slug]/actions";
import { IntentPicker } from "@/app/l/[slug]/intent-picker";
import { LoopFactsBlock } from "@/app/l/[slug]/loop-facts";
import { LeaveControl } from "@/app/l/[slug]/me/leave-control";
import type { Params, SearchParams } from "@/app/l/[slug]/tap-in";

type OwnMembership = {
  id: string;
  intent: Intent;
  crew_id: string | null;
  left_at: string | null;
};

type ReplyStatus = RsvpStatus | "no_reply";

/** A row of `v_crew_members`, read with exactly these columns. */
type CrewMember = {
  membership_id: string;
  first_name: string;
  is_you: boolean;
  rsvp_status: ReplyStatus;
};

const CREW_COLUMNS = "membership_id, first_name, is_you, rsvp_status";

const REPLY_LABELS: Record<ReplyStatus, string> = { in: "In", out: "Out", no_reply: "No reply" };

/** The "Marked you as In for Thursday" banner, shown only when it matches the stored answer. */
type Marked = { occurrenceId: string; status: RsvpStatus; weekday: string };

/** Fixed copy per `?error=` code from the form adapters in actions.ts; anything else shows nothing. */
const ERROR_COPY: Record<ActionErrorCode, string> = {
  not_yours: "That membership isn't yours.",
  signed_out: "Sign in to change this.",
  bad_intent: "Pick one of the three options.",
  left: "You've left this loop. Tap in again to rejoin.",
  failed: "That didn't save. Try again.",
  rsvp_refused: "You can't answer for this week.",
};

function errorCopy(raw: string | undefined): string | null {
  return raw !== undefined && Object.hasOwn(ERROR_COPY, raw)
    ? ERROR_COPY[raw as ActionErrorCode]
    : null;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The member page body. Requires a signed-in, named person with an active
 * membership (own row read through RLS); anyone else goes to the tap-in page.
 * Loop facts come from the shared service-role read, as on the public page.
 * Crewmates come only from `v_crew_members` through the RLS client.
 */
export async function Member({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const query = await searchParams;

  const person = await requirePerson(`/l/${slug}/me`);

  const admin = createAdminClient();
  const view = await getLoopView(admin, slug);
  if (!view) notFound();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("membership")
    .select("id, intent, crew_id, left_at")
    .eq("loop_id", view.loop.id)
    .eq("person_id", person.id)
    .maybeSingle();
  if (error) throw error;
  const membership = (data as OwnMembership | null) ?? null;
  if (!membership || membership.left_at !== null) redirect(`/l/${slug}`);

  const props = {
    view,
    preview: await getLinkPreview(admin, view.effectiveUrl),
    membership,
    focusIntent: first(query.focus) === "intent",
    message: errorCopy(first(query.error)),
  };

  if (membership.crew_id === null) return <WaitingView {...props} />;

  const crewRead = await supabase
    .from("v_crew_members")
    .select(CREW_COLUMNS)
    .eq("crew_id", membership.crew_id)
    .order("first_name")
    .order("membership_id");
  if (crewRead.error) throw crewRead.error;
  // Viewer first; the rest keep the read's (first_name, membership_id) order (stable sort).
  const crew = ((crewRead.data as CrewMember[] | null) ?? [])
    .slice()
    .sort((a, b) => Number(b.is_you) - Number(a.is_you));

  const mine: ReplyStatus = crew.find((m) => m.is_you)?.rsvp_status ?? "no_reply";
  const marked = findMarked(view, mine, query.marked, query.occ);

  return <CrewedView {...props} crew={crew} marked={marked} />;
}

/**
 * The banner for `?marked=in|out&occ=<id>`: only when `occ` is the loop's next
 * occurrence (not cancelled, not ended) and the viewer's own answer for it,
 * from the `v_crew_members` row already read, equals `marked`. A crafted or
 * stale URL (another loop, a later or past week) shows nothing.
 */
function findMarked(
  view: LoopView,
  mine: ReplyStatus,
  rawMarked: string | string[] | undefined,
  rawOcc: string | string[] | undefined,
): Marked | null {
  const status = first(rawMarked);
  const occurrenceId = first(rawOcc);
  if (status !== "in" && status !== "out") return null;
  const next = view.next;
  if (!next || view.ended || view.cancelled || occurrenceId !== next.id) return null;
  if (mine !== status) return null;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: view.tz, weekday: "long" }).format(
    new Date(next.starts_at),
  );
  return { occurrenceId: next.id, status, weekday };
}

function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-accent-strong">
      {message}
    </p>
  ) : null;
}

function IntentForm({
  view,
  membership,
  focusIntent,
}: {
  view: LoopView;
  membership: OwnMembership;
  focusIntent: boolean;
}) {
  return (
    <form action={setIntentForm} className="flex flex-col gap-5">
      <input type="hidden" name="membership_id" value={membership.id} />
      <input type="hidden" name="slug" value={view.loop.slug} />
      <IntentPicker initial={membership.intent} submitLabel="Save" autoFocus={focusIntent} />
    </form>
  );
}

/** Waiting state: facts, the waiting line, own intent control, leave. No names, no counts, no RSVP. */
function WaitingView({
  view,
  preview,
  membership,
  focusIntent,
  message,
}: {
  view: LoopView;
  preview: LinkPreview | null;
  membership: OwnMembership;
  focusIntent: boolean;
  message: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <LoopFactsBlock view={view} preview={preview} />
      <ErrorLine message={message} />
      {view.ended ? (
        <p className="text-secondary">This one already happened.</p>
      ) : view.cancelled ? null : (
        <>
          <p className="text-secondary">
            You&apos;re in the pool. Crews are set by the organizer before each week.
          </p>
          <IntentForm view={view} membership={membership} focusIntent={focusIntent} />
        </>
      )}
      <div className="flex justify-start">
        <LeaveControl
          membershipId={membership.id}
          slug={view.loop.slug}
          crewed={membership.crew_id !== null}
        />
      </div>
    </div>
  );
}

/**
 * Crewed state: facts, the marked banner, the crew by first name with this
 * week's answer, the viewer's own "I'm in" / "Can't this week", own intent,
 * leave. Nothing else about crewmates.
 */
function CrewedView({
  view,
  preview,
  membership,
  focusIntent,
  message,
  crew,
  marked,
}: {
  view: LoopView;
  preview: LinkPreview | null;
  membership: OwnMembership;
  focusIntent: boolean;
  message: string | null;
  crew: CrewMember[];
  marked: Marked | null;
}) {
  const mine: ReplyStatus = crew.find((m) => m.is_you)?.rsvp_status ?? "no_reply";
  const open = !view.ended && !view.cancelled;
  return (
    <div className="flex flex-col gap-6">
      <LoopFactsBlock view={view} preview={preview} />
      <ErrorLine message={message} />
      {marked ? (
        <div role="status" className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            Marked you as {REPLY_LABELS[marked.status]} for {marked.weekday}
          </span>
          <form action={undoMarkedForm}>
            <input type="hidden" name="slug" value={view.loop.slug} />
            <input type="hidden" name="occurrence_id" value={marked.occurrenceId} />
            <input type="hidden" name="marked" value={marked.status} />
            <button type="submit" className="pls-btn pls-btn--ghost pls-btn--sm">
              Undo
            </button>
          </form>
        </div>
      ) : null}
      {view.ended ? <p className="text-secondary">This one already happened.</p> : null}
      <section aria-label="Your crew" className="flex flex-col gap-2">
        <h2 className="font-semibold">Your crew</h2>
        <ul className="flex flex-col gap-1">
          {crew.map((m) => (
            <li key={m.membership_id} className="flex justify-between gap-3">
              <span>
                {m.first_name}
                {m.is_you ? " (you)" : ""}
              </span>
              <span className="text-secondary">{REPLY_LABELS[m.rsvp_status] ?? "No reply"}</span>
            </li>
          ))}
        </ul>
      </section>
      {open && view.next ? (
        <div className="flex flex-wrap gap-3">
          <RsvpButton slug={view.loop.slug} occurrenceId={view.next.id} status="in" current={mine}>
            I&apos;m in
          </RsvpButton>
          <RsvpButton slug={view.loop.slug} occurrenceId={view.next.id} status="out" current={mine}>
            Can&apos;t this week
          </RsvpButton>
        </div>
      ) : null}
      {open ? <IntentForm view={view} membership={membership} focusIntent={focusIntent} /> : null}
      <div className="flex justify-start">
        <LeaveControl
          membershipId={membership.id}
          slug={view.loop.slug}
          crewed={membership.crew_id !== null}
        />
      </div>
    </div>
  );
}

/** One of the two RSVP buttons; the viewer's current answer shows as pressed. */
function RsvpButton({
  slug,
  occurrenceId,
  status,
  current,
  children,
}: {
  slug: string;
  occurrenceId: string;
  status: RsvpStatus;
  current: ReplyStatus;
  children: ReactNode;
}) {
  const selected = current === status;
  return (
    <form action={setRsvpForm}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="occurrence_id" value={occurrenceId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        aria-pressed={selected}
        className={`pls-btn ${selected ? "pls-btn--primary" : "pls-btn--secondary"}`}
      >
        {children}
      </button>
    </form>
  );
}
