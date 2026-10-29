"use server";

import { redirect } from "next/navigation";
import { getSession, safeNext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type WelcomeState = { status: "idle" } | { status: "error"; message: string };

const FIRST_NAME_MAX = 40;

/** Writes the first name for the signed-in person only, then returns to `next`. */
export async function saveFirstName(
  _prev: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  const next = safeNext(formData.get("next"));
  const firstName = String(formData.get("first_name") ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (firstName.length === 0) {
    return { status: "error", message: "Enter your first name." };
  }
  if (firstName.length > FIRST_NAME_MAX) {
    return { status: "error", message: `Keep it under ${FIRST_NAME_MAX} characters.` };
  }

  const session = await getSession();
  if (!session) redirect(`/signin?next=${encodeURIComponent(next)}`);

  // Only the signed-in person's own row, and only while it is still unnamed.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("person")
    .update({ first_name: firstName })
    .eq("id", session.userId)
    .is("first_name", null)
    .select("id");
  if (error) {
    return { status: "error", message: "We couldn't save that just now. Try again." };
  }
  if (data.length === 0) {
    // Already named (double submit or a stale form): nothing was written.
    redirect(next);
  }

  redirect(next);
}
