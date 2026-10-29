"use client";

import { useActionState } from "react";
import { setOccurrenceUrl, type OccurrenceUrlState } from "@/app/org/[slug]/sections-actions";
import { PARTIFUL_NOTE } from "@/lib/organizer-shared";

const initialState: OccurrenceUrlState = { status: "idle" };

const INPUT =
  "min-h-10 w-full rounded-[var(--radius-md)] bg-sunken px-3 text-sm text-primary placeholder:text-tertiary";

/** This occurrence's link override; empty falls back to the loop default. */
export function OccurrenceUrlForm({
  slug,
  occurrenceId,
  linkedUrl,
  defaultUrl,
  partifulNote,
  label,
}: {
  slug: string;
  occurrenceId: string;
  /** The saved override, if any. */
  linkedUrl: string | null;
  /** The loop's default URL, shown as the placeholder. */
  defaultUrl: string | null;
  /** True when the effective URL (override, else default) is on partiful.com. */
  partifulNote: boolean;
  /** Accessible name for the field, e.g. "Link for Thu, Oct 22, 7:00 PM". */
  label: string;
}) {
  const [state, formAction, pending] = useActionState(setOccurrenceUrl, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="occurrence_id" value={occurrenceId} />
      <div className="flex items-center gap-2">
        <input
          type="url"
          name="linked_url"
          inputMode="url"
          aria-label={label}
          defaultValue={linkedUrl ?? ""}
          placeholder={defaultUrl ?? "https://lu.ma/…"}
          className={INPUT}
        />
        <button type="submit" className="pls-btn pls-btn--ghost pls-btn--sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {partifulNote ? <span className="text-xs text-tertiary">{PARTIFUL_NOTE}</span> : null}
      {state.status === "error" ? (
        <span role="alert" className="text-xs text-accent-strong">
          {state.message}
        </span>
      ) : null}
      {state.status === "saved" ? <span className="text-xs text-secondary">Saved.</span> : null}
    </form>
  );
}
