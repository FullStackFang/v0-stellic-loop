"use client";

import { useActionState } from "react";
import { confirmSignIn, type ConfirmState } from "@/app/auth/confirm/actions";
import { SignInForm } from "@/app/signin/signin-form";

const initialState: ConfirmState = { status: "idle" };

/**
 * The Continue step. The token is consumed only when this form posts, so a
 * mail scanner that prefetches the link leaves it valid. An expired or used
 * token shows the resend form instead.
 */
export function ConfirmForm({ tokenHash, next }: { tokenHash: string | null; next: string }) {
  const [state, formAction, pending] = useActionState(confirmSignIn, initialState);

  if (!tokenHash || state.status === "error") {
    return (
      <div className="flex flex-col gap-5">
        <p role="alert" className="text-sm text-accent-strong">
          That sign-in link has expired or was already used. Send yourself a new one.
        </p>
        <SignInForm next={next} heading="Send a new link" />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="pls-kicker">Loop</span>
        <h1 className="pls-display text-3xl font-bold leading-tight">Almost in</h1>
        <p className="text-secondary">Press Continue to finish signing in.</p>
      </div>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="next" value={next} />
      <button type="submit" className="pls-btn pls-btn--primary pls-btn--block" disabled={pending}>
        {pending ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}
