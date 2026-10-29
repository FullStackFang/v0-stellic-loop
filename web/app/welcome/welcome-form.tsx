"use client";

import { useActionState } from "react";
import { saveFirstName, type WelcomeState } from "@/app/welcome/actions";

const initialState: WelcomeState = { status: "idle" };

/** First-name form shown once, on the first sign-in. */
export function WelcomeForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(saveFirstName, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="pls-kicker">Loop</span>
        <h1 className="pls-display text-3xl font-bold leading-tight">What should we call you?</h1>
        <p className="text-secondary">Your first name is the only thing your crew sees.</p>
      </div>
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">First name</span>
        <input
          type="text"
          name="first_name"
          autoComplete="given-name"
          required
          maxLength={40}
          placeholder="Sarah"
          className="min-h-11 rounded-[var(--radius-md)] bg-sunken px-4 text-base text-primary placeholder:text-tertiary"
        />
      </label>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-accent-strong">
          {state.message}
        </p>
      ) : null}
      <button type="submit" className="pls-btn pls-btn--primary pls-btn--block" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
