"use client";

import { useActionState } from "react";
import { cancelOccurrence, type CancelOccurrenceState } from "@/app/org/[slug]/sections-actions";

const initialState: CancelOccurrenceState = { status: "idle" };

/** Cancels one future occurrence after a confirm. */
export function CancelOccurrenceButton({
  slug,
  occurrenceId,
  when,
}: {
  slug: string;
  occurrenceId: string;
  /** "Thu, Oct 22, 7:00 PM", for the confirm prompt. */
  when: string;
}) {
  const [state, formAction, pending] = useActionState(cancelOccurrence, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Cancel the ${when} meeting? Members will see the next one instead.`)) {
          e.preventDefault();
        }
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="occurrence_id" value={occurrenceId} />
      <button type="submit" className="pls-btn pls-btn--ghost pls-btn--sm" disabled={pending}>
        {pending ? "Cancelling…" : "Cancel"}
      </button>
      {state.status === "error" ? (
        <span role="alert" className="text-xs text-accent-strong">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
