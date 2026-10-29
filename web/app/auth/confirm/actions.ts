"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ConfirmState = { status: "idle" } | { status: "error" };

/**
 * Consumes the single-use token only on this POST (never on the GET that
 * rendered the page), sets the session cookies, and returns to `next`.
 */
export async function confirmSignIn(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const next = safeNext(formData.get("next"));
  if (!tokenHash) return { status: "error" };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (error) return { status: "error" };

  redirect(next);
}
