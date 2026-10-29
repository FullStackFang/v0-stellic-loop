"use server";

import { revalidatePath } from "next/cache";
import { leave, type MembershipRow } from "@/app/l/[slug]/membership";
import { dropUrl, randomToken, requireOrganizerOfLoop } from "@/lib/organizer";
import { isDropKind, parseHttpUrl } from "@/lib/organizer-shared";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Dashboard writes. Each one re-verifies with the session that the caller
 * organizes the loop named by the form's `slug` (`requireOrganizerOfLoop`
 * reads through RLS and 404s otherwise), then writes with the admin client
 * scoped to that loop's id.
 */

export type SettingsState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message: string };

export type AddDropState =
  | { status: "idle" }
  | { status: "added"; url: string }
  | { status: "error"; message: string };

export type RemoveMemberState =
  | { status: "idle" }
  | { status: "removed" }
  | { status: "error"; message: string };

const PLACE_MAX = 120;
const LABEL_MAX = 60;
const GENERIC_RETRY = "We couldn't save that just now. Try again.";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function dashboardPath(slug: string): string {
  return `/org/${slug}`;
}

/** Edits place and the default linked URL. Weekday and time are immutable by spec. */
export async function updateLoopSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const slug = field(formData, "slug");
  const { loop, person } = await requireOrganizerOfLoop(slug);

  const place = field(formData, "place").replace(/\s+/g, " ");
  if (place === "") return { status: "error", message: "Say where it meets." };
  if (place.length > PLACE_MAX) {
    return { status: "error", message: `Keep the place under ${PLACE_MAX} characters.` };
  }

  const linkedRaw = field(formData, "linked_url");
  const linkedUrl = linkedRaw === "" ? null : parseHttpUrl(linkedRaw);
  if (linkedRaw !== "" && linkedUrl === null) {
    return { status: "error", message: "The event link must start with http:// or https://." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("loop")
    .update({ place, linked_url: linkedUrl })
    .eq("id", loop.id)
    .eq("organizer_id", person.id);
  if (error) return { status: "error", message: GENERIC_RETRY };

  revalidatePath(dashboardPath(slug));
  return { status: "saved" };
}

/** Adds a labeled share link with a fresh unguessable token; returns its full URL. */
export async function addDrop(_prev: AddDropState, formData: FormData): Promise<AddDropState> {
  const slug = field(formData, "slug");
  const { loop } = await requireOrganizerOfLoop(slug);

  const label = field(formData, "label").replace(/\s+/g, " ");
  if (label === "") return { status: "error", message: "Give the drop a label." };
  if (label.length > LABEL_MAX) {
    return { status: "error", message: `Keep the label under ${LABEL_MAX} characters.` };
  }
  const kind = field(formData, "kind");
  if (!isDropKind(kind)) return { status: "error", message: "Pick what kind of drop this is." };

  const token = randomToken(24);
  const admin = createAdminClient();
  const { error } = await admin.from("drop").insert({ loop_id: loop.id, token, label, kind });
  if (error) return { status: "error", message: GENERIC_RETRY };

  revalidatePath(dashboardPath(slug));
  return { status: "added", url: dropUrl(slug, token) };
}

/** `MembershipRow`'s columns; `leave()` takes the whole row. */
const MEMBERSHIP_COLUMNS =
  "id, loop_id, person_id, intent, tapped_in_at, crewed_at, crew_id, left_at, drop_id, rsvp_source";

/**
 * Removes a member through the same `leave()` a member uses (sets `left_at`,
 * keeps `crew_id` so past attendance stays attributed). The membership is
 * looked up scoped to the verified loop's id and to active rows, so a
 * membership of another loop, or one already left, is never touched.
 */
export async function removeMember(
  _prev: RemoveMemberState,
  formData: FormData,
): Promise<RemoveMemberState> {
  const slug = field(formData, "slug");
  const { loop } = await requireOrganizerOfLoop(slug);

  const membershipId = field(formData, "membership_id");
  if (membershipId === "") return { status: "error", message: "No member selected." };

  const admin = createAdminClient();
  const { data: membership, error } = await admin
    .from("membership")
    .select(MEMBERSHIP_COLUMNS)
    .eq("id", membershipId)
    .eq("loop_id", loop.id)
    .is("left_at", null)
    .maybeSingle<MembershipRow>();
  if (error) return { status: "error", message: GENERIC_RETRY };
  if (!membership) {
    return { status: "error", message: "That member is not active in this loop." };
  }
  try {
    await leave(admin, membership);
  } catch {
    return { status: "error", message: GENERIC_RETRY };
  }

  revalidatePath(dashboardPath(slug));
  return { status: "removed" };
}
