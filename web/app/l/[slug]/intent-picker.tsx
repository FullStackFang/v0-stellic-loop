"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { INTENTS, INTENT_LABELS, type Intent } from "@/lib/loops";

const INTENT_HINTS: Partial<Record<Intent, string>> = {
  going_want_crew: "Already RSVPed on Luma or Partiful? Get a crew so you don't walk in alone.",
};

/**
 * The three intent radios. Must sit inside a `<form>`: the submit button reads
 * the form's pending state, and its text follows the selection unless
 * `submitLabel` pins it (the member page's "Save").
 */
export function IntentPicker({
  initial,
  submitLabel,
  autoFocus = false,
}: {
  initial: Intent;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const [intent, setIntent] = useState<Intent>(initial);

  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="pls-kicker mb-2">Your intent</legend>
        {INTENTS.map((value) => {
          const checked = value === intent;
          const hint = INTENT_HINTS[value];
          return (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] px-4 py-3 ${
                checked ? "bg-accent-quiet" : "bg-sunken"
              }`}
            >
              <input
                type="radio"
                name="intent"
                value={value}
                checked={checked}
                onChange={() => setIntent(value)}
                // `?focus=intent` from an email lands on the current choice on purpose.
                autoFocus={autoFocus && checked}
                className="mt-1 accent-[var(--accent)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{INTENT_LABELS[value]}</span>
                {hint ? <span className="text-sm text-secondary">{hint}</span> : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      <SubmitButton label={submitLabel ?? INTENT_LABELS[intent]} />
    </>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="pls-btn pls-btn--primary pls-btn--block" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}
