"use server";

import { safeNext } from "@/lib/auth";
import { appUrl } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

const CAMPUS_EMAIL_REQUIRED = "A campus email is required. Use your university address.";
const GENERIC_RETRY = "We couldn't send the link just now. Try again in a minute.";

/**
 * The before-user-created auth hook rejects non-campus domains with a message
 * that names the campus; Supabase passes that message through to the client.
 */
function isCampusRejection(error: { message: string }): boolean {
  return /campus/i.test(error.message);
}

/** Form action for the email form. Never reveals whether the address is known. */
export async function sendSignInLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const next = safeNext(formData.get("next"));

  if (!email.includes("@")) {
    return { status: "error", message: "Enter your email address." };
  }

  // The hosted magic-link template links to
  // /auth/confirm?token_hash=…&type=email&next={{ .RedirectTo }}, so the
  // redirect target is the final destination itself; the confirm page's
  // safeNext reduces it back to a path. Requires `${NEXT_PUBLIC_APP_URL}/**`
  // in Supabase's Redirect URLs allow list.
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appUrl()}${next}`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return {
      status: "error",
      message: isCampusRejection(error) ? CAMPUS_EMAIL_REQUIRED : GENERIC_RETRY,
    };
  }
  return { status: "sent", email };
}
