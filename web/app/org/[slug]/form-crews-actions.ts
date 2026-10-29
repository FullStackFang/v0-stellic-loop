"use server";

import { revalidatePath } from "next/cache";
import { chunks } from "@/lib/chunks";
import { confirmFormation, previewFormation, type FormationCounts } from "@/lib/formationRun";
import type { AdminClient } from "@/lib/loops";
import { requireOrganizerOfLoop } from "@/lib/organizer";
import { sendPlacementEmails } from "@/lib/placementEmails";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Form crews" → "Confirm" (organizer-dashboard "Form crews with preview and
 * confirm"; crew-formation "Formation is organizer-triggered"). Both steps
 * run `requireOrganizerOfLoop` before any admin call. `previewFormCrews`
 * only reads: it computes the placements and names them for the organizer's
 * own dashboard. `confirmFormCrews` re-derives placements through
 * `confirmFormation`, which refuses when the pool changed since the preview;
 * placement emails go out only after a successful apply, and a failed send
 * is counted, never undoing a placement.
 */

export type PreviewMember = { firstName: string; joining: boolean };

/** One crew the confirm would touch: an existing crew receiving members, or a new one. */
export type PreviewCrew = { kind: "existing" | "new"; members: PreviewMember[] };

export type FormCrewsState =
  | { status: "idle" }
  | {
      status: "preview";
      counts: FormationCounts;
      placements: PreviewCrew[];
      inputHash: string;
      /** Set when a confirm found the pool changed and this is the fresh preview. */
      message?: string;
    }
  | { status: "error"; message: string }
  | {
      status: "formed";
      placed: number;
      emailed: number;
      emailFailed: number;
      /** Who did not get an email, so the organizer can tell them in person. */
      emailFailedFirstNames: string[];
    };

const POOL_CHANGED_MESSAGE = "The pool changed since the preview. Here's the fresh one.";
const ALREADY_FORMED_MESSAGE = "Crews are already formed.";
const GENERIC_ERROR = "We couldn't form crews just now. Try again.";
const NO_NAME = "(no name yet)";

type MembershipRow = { id: string; person_id: string; crew_id: string | null };
type PersonRow = { id: string; first_name: string | null };

function slugOf(formData: FormData): string {
  return String(formData.get("slug") ?? "").trim();
}

/** The preview with first names; call only after the organizer check. Throws on a read error. */
async function buildPreview(
  admin: AdminClient,
  loopId: string,
): Promise<Extract<FormCrewsState, { status: "preview" }>> {
  const result = await previewFormation(admin, loopId);

  const members = await admin
    .from("membership")
    .select("id, person_id, crew_id")
    .eq("loop_id", loopId)
    .is("left_at", null)
    .order("tapped_in_at", { ascending: true })
    // PostgREST caps a response at max_rows (Supabase default 1000) without an
    // error; an explicit range asks for up to 5000 rows. Raise max_rows to match
    // before a loop can have more active members than the cap.
    .range(0, 4999);
  if (members.error) throw members.error;
  const rows = (members.data ?? []) as MembershipRow[];

  const personIds = [...new Set(rows.map((m) => m.person_id))];
  const firstNames = new Map<string, string | null>();
  for (const batch of chunks(personIds)) {
    const people = await admin.from("person").select("id, first_name").in("id", batch);
    if (people.error) throw people.error;
    for (const p of (people.data ?? []) as PersonRow[]) firstNames.set(p.id, p.first_name);
  }
  const byId = new Map(rows.map((m) => [m.id, m]));
  const nameOf = (membershipId: string) => {
    const personId = byId.get(membershipId)?.person_id;
    return (personId ? firstNames.get(personId) : null) ?? NO_NAME;
  };

  const joiningByCrew = new Map<string, string[]>();
  for (const f of result.fills) {
    joiningByCrew.set(f.crewId, [...(joiningByCrew.get(f.crewId) ?? []), f.membershipId]);
  }
  const existing: PreviewCrew[] = [...joiningByCrew].map(([crewId, joining]) => ({
    kind: "existing",
    members: [
      ...rows.filter((m) => m.crew_id === crewId).map((m) => ({ firstName: nameOf(m.id), joining: false })),
      ...joining.map((id) => ({ firstName: nameOf(id), joining: true })),
    ],
  }));
  const fresh: PreviewCrew[] = result.newCrews.map((c) => ({
    kind: "new",
    members: c.membershipIds.map((id) => ({ firstName: nameOf(id), joining: true })),
  }));

  return {
    status: "preview",
    counts: result.counts,
    placements: [...existing, ...fresh],
    inputHash: result.inputHash,
  };
}

/** Step 1, "Form crews": computes and names the proposed placements. Writes nothing. */
export async function previewFormCrews(
  _prev: FormCrewsState,
  formData: FormData,
): Promise<FormCrewsState> {
  const { loop } = await requireOrganizerOfLoop(slugOf(formData));
  try {
    return await buildPreview(createAdminClient(), loop.id);
  } catch (err) {
    console.error("previewFormCrews:", err);
    return { status: "error", message: GENERIC_ERROR };
  }
}

/** Step 2, "Confirm": applies the previewed placements and emails the newly placed. */
export async function confirmFormCrews(
  _prev: FormCrewsState,
  formData: FormData,
): Promise<FormCrewsState> {
  const slug = slugOf(formData);
  const { loop } = await requireOrganizerOfLoop(slug);

  const inputHash = String(formData.get("input_hash") ?? "").trim();
  if (inputHash === "") return { status: "error", message: GENERIC_ERROR };

  const admin = createAdminClient();
  const result = await confirmFormation(admin, loop.id, inputHash);

  if (!result.ok) {
    if (result.reason === "error") return { status: "error", message: GENERIC_ERROR };
    try {
      const fresh = await buildPreview(admin, loop.id);
      // The page behind the preview is stale too (members, waiting count).
      revalidatePath(`/org/${slug}`);
      // A second confirm of an already applied preview lands here with nothing left
      // to place and nobody waiting. Nothing to place but someone still waiting means
      // the pool shrank below a crew, which is a change, not a repeat.
      const message =
        fresh.placements.length === 0 && fresh.counts.waiting === 0
          ? ALREADY_FORMED_MESSAGE
          : POOL_CHANGED_MESSAGE;
      return { ...fresh, message };
    } catch (err) {
      console.error("confirmFormCrews: fresh preview failed", err);
      return { status: "error", message: GENERIC_ERROR };
    }
  }

  const { sent, failed, failedFirstNames } = await sendPlacementEmails(admin, loop.id, result.placedMembershipIds, new Date());
  if (failed > 0) console.error(`confirmFormCrews: ${failed} placement email(s) failed for loop ${loop.id}`);

  revalidatePath(`/org/${slug}`);
  return {
    status: "formed",
    placed: result.placedMembershipIds.length,
    emailed: sent,
    emailFailed: failed,
    emailFailedFirstNames: failedFirstNames,
  };
}
