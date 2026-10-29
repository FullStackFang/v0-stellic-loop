"use server";

import { notFound, redirect } from "next/navigation";
import { getSession, requirePerson } from "@/lib/auth";
import {
  DEFAULT_INTENT,
  cleanDropToken,
  getLoopById,
  getLoopBySlug,
  isSlug,
  parseIntent,
  parseRsvpSource,
  type Intent,
} from "@/lib/loops";
import { setRsvp, undoRsvp, type SetRsvpInput, type SetRsvpResult } from "@/lib/rsvp";
import type { RsvpStatus } from "@/lib/signedLink";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  changeIntent,
  completeTapIn,
  findMembership,
  getOwnedMembership,
  leave,
  reactivate,
  tapInNext,
} from "@/app/l/[slug]/membership";

/**
 * Short codes the member page maps to fixed copy (me/member.tsx); the page
 * never renders `?error=` text itself.
 */
export type ActionErrorCode =
  | "not_yours"
  | "signed_out"
  | "bad_intent"
  | "left"
  | "failed"
  | "rsvp_refused";

export type ActionResult = { ok: true; slug: string } | { ok: false; code: ActionErrorCode };

/**
 * Form action of the tap-in page. Signed out → /signin (then /welcome when
 * needed) with `next` carrying slug, intent, drop and RSVP source, so the
 * tap-in completes on return (see tap-in.tsx). Signed in → campus check,
 * write once, land on the member page.
 */
export async function tapIn(formData: FormData): Promise<void> {
  const slug = formData.get("slug");
  if (!isSlug(slug)) notFound();
  const intent = parseIntent(formData.get("intent")) ?? DEFAULT_INTENT;
  const dropToken = cleanDropToken(formData.get("d"));
  const rsvpSource = parseRsvpSource(formData.get("rsvp_source"));

  const person = await requirePerson(tapInNext(slug, intent, dropToken, rsvpSource));

  const admin = createAdminClient();
  const loop = await getLoopBySlug(admin, slug);
  if (!loop) notFound();

  const result = await completeTapIn(admin, person, loop, intent, dropToken, rsvpSource);
  if (!result.ok) redirect(`/l/${slug}?error=${result.reason}`);
  redirect(`/l/${slug}/me`);
}

/** Changes the standing intent of the caller's own membership. Never touches `crew_id`. */
export async function setIntent(membershipId: string, intent: Intent): Promise<ActionResult> {
  const parsed = parseIntent(intent);
  if (!parsed) return { ok: false, code: "bad_intent" };
  const session = await getSession();
  if (!session) return { ok: false, code: "signed_out" };

  const admin = createAdminClient();
  const membership = await getOwnedMembership(admin, String(membershipId), session.userId);
  if (!membership) return { ok: false, code: "not_yours" };
  if (membership.left_at !== null) {
    return { ok: false, code: "left" };
  }
  const loop = await getLoopById(admin, membership.loop_id);
  if (!loop) return { ok: false, code: "not_yours" };

  await changeIntent(admin, membership, parsed, loop);
  return { ok: true, slug: loop.slug };
}

/** Sets `left_at` on the caller's own membership; `crew_id` is kept for attribution. */
export async function leaveLoop(membershipId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, code: "signed_out" };

  const admin = createAdminClient();
  const membership = await getOwnedMembership(admin, String(membershipId), session.userId);
  if (!membership) return { ok: false, code: "not_yours" };
  const loop = await getLoopById(admin, membership.loop_id);
  if (!loop) return { ok: false, code: "not_yours" };
  if (membership.left_at !== null) return { ok: true, slug: loop.slug };

  await leave(admin, membership);
  return { ok: true, slug: loop.slug };
}

/** Reactivates the caller's own left membership: no crew, chosen intent, original drop. */
export async function rejoin(membershipId: string, intent: Intent): Promise<ActionResult> {
  const parsed = parseIntent(intent);
  if (!parsed) return { ok: false, code: "bad_intent" };
  const session = await getSession();
  if (!session) return { ok: false, code: "signed_out" };

  const admin = createAdminClient();
  const membership = await getOwnedMembership(admin, String(membershipId), session.userId);
  if (!membership) return { ok: false, code: "not_yours" };
  const loop = await getLoopById(admin, membership.loop_id);
  if (!loop) return { ok: false, code: "not_yours" };
  if (membership.left_at === null) {
    await changeIntent(admin, membership, parsed, loop);
  } else {
    await reactivate(admin, membership, parsed, loop);
  }
  return { ok: true, slug: loop.slug };
}

// ---------------------------------------------------------------------------
// Form adapters for the member page
// ---------------------------------------------------------------------------

function memberPageUrl(result: ActionResult, fallbackSlug: unknown): string {
  const slug = result.ok ? result.slug : isSlug(fallbackSlug) ? fallbackSlug : null;
  if (!slug) return "/";
  return result.ok
    ? `/l/${slug}/me`
    : `/l/${slug}/me?error=${result.code}`;
}

/** A thrown write becomes `failed` on the member page instead of an error screen. */
async function orFailed(run: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await run();
  } catch (err) {
    console.error(err);
    return { ok: false, code: "failed" };
  }
}

/** `<form action={setIntentForm}>` with `membership_id`, `intent`, `slug`. */
export async function setIntentForm(formData: FormData): Promise<void> {
  const intent = parseIntent(formData.get("intent"));
  const result: ActionResult = intent
    ? await orFailed(() => setIntent(String(formData.get("membership_id") ?? ""), intent))
    : { ok: false, code: "bad_intent" };
  redirect(memberPageUrl(result, formData.get("slug")));
}

/** `<form action={leaveLoopForm}>` with `membership_id`, `slug`. Lands on the tap-in page. */
export async function leaveLoopForm(formData: FormData): Promise<void> {
  const result = await orFailed(() => leaveLoop(String(formData.get("membership_id") ?? "")));
  if (!result.ok) redirect(memberPageUrl(result, formData.get("slug")));
  redirect(`/l/${result.slug}?left=1`);
}

// ---------------------------------------------------------------------------
// RSVP form actions (member page buttons and the "Marked you as …" undo)
// ---------------------------------------------------------------------------

/** A form `occurrence_id` must be a UUID before it reaches a query. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRsvpStatus(raw: unknown): RsvpStatus | null {
  return raw === "in" || raw === "out" ? raw : null;
}

/**
 * Shared body of the RSVP form actions. The acting membership is always the
 * session's own membership in the loop named by `slug`; a membership id in
 * the form is never read. Lands on the member page, with `?error=` on refusal.
 */
async function rsvpFormAction(
  formData: FormData,
  statusField: "status" | "marked",
  write: (admin: ReturnType<typeof createAdminClient>, input: SetRsvpInput) => Promise<SetRsvpResult>,
): Promise<void> {
  const slug = formData.get("slug");
  if (!isSlug(slug)) redirect("/");
  const status = parseRsvpStatus(formData.get(statusField));
  const occurrenceId = String(formData.get("occurrence_id") ?? "");

  const run = async (): Promise<ActionErrorCode | null> => {
    if (!status || !UUID.test(occurrenceId)) return "rsvp_refused";
    const session = await getSession();
    if (!session) return "signed_out";
    const admin = createAdminClient();
    const loop = await getLoopBySlug(admin, slug);
    if (!loop) return "rsvp_refused";
    const membership = await findMembership(admin, loop.id, session.userId);
    if (!membership) return "rsvp_refused";
    const result = await write(admin, {
      membershipId: membership.id,
      occurrenceId,
      status,
      now: new Date(),
    });
    if (result.ok) return null;
    return result.reason === "error" ? "failed" : "rsvp_refused";
  };

  let code: ActionErrorCode | null;
  try {
    code = await run();
  } catch (err) {
    console.error(err);
    code = "failed";
  }
  redirect(code ? `/l/${slug}/me?error=${code}` : `/l/${slug}/me`);
}

/** `<form action={setRsvpForm}>` with `slug`, `occurrence_id`, `status` (in | out). */
export async function setRsvpForm(formData: FormData): Promise<void> {
  await rsvpFormAction(formData, "status", setRsvp);
}

/**
 * `<form action={undoMarkedForm}>` with `slug`, `occurrence_id`, `marked`
 * (the status the signed link recorded). Flips it via `undoRsvp` and lands on
 * the member page without `?marked=`, so the banner is gone.
 */
export async function undoMarkedForm(formData: FormData): Promise<void> {
  await rsvpFormAction(formData, "marked", undoRsvp);
}
