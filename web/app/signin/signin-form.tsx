"use client";

import { useActionState } from "react";
import { sendSignInLink, type SignInState } from "@/app/signin/actions";

const initialState: SignInState = { status: "idle" };

/** Email form that sends a sign-in link and carries `next` through. */
export function SignInForm({ next, heading }: { next: string; heading?: string }) {
  const [state, formAction, pending] = useActionState(sendSignInLink, initialState);

  if (state.status === "sent") {
    return (
      <div className="flex flex-col gap-2">
        <span className="pls-kicker">Loop</span>
        <h1 className="pls-display text-3xl font-bold leading-tight">Check your email</h1>
        <p className="text-secondary">
          We sent a sign-in link to <span className="pls-mono">{state.email}</span>. Open it on
          this device and press Continue.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="pls-kicker">Loop</span>
        <h1 className="pls-display text-3xl font-bold leading-tight">{heading ?? "Sign in"}</h1>
        <p className="text-secondary">
          Enter your campus email and we&apos;ll send you a link. No password.
        </p>
      </div>
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Campus email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@cornell.edu"
          className="min-h-11 rounded-[var(--radius-md)] bg-sunken px-4 text-base text-primary placeholder:text-tertiary"
        />
      </label>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-accent-strong">
          {state.message}
        </p>
      ) : null}
      <button type="submit" className="pls-btn pls-btn--primary pls-btn--block" disabled={pending}>
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
