"use client";

import { useActionState } from "react";
import { updateLoopSettings, type SettingsState } from "@/app/org/[slug]/actions";
import { PARTIFUL_NOTE } from "@/lib/organizer-shared";

const initialState: SettingsState = { status: "idle" };

const INPUT =
  "min-h-11 rounded-[var(--radius-md)] bg-sunken px-4 text-base text-primary placeholder:text-tertiary";

/** Editable place and default linked URL; the slot itself is shown read-only by the caller. */
export function SettingsForm({
  slug,
  place,
  linkedUrl,
  partifulNote,
}: {
  slug: string;
  place: string;
  linkedUrl: string | null;
  /** True when the saved default URL is on partiful.com. */
  partifulNote: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateLoopSettings, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Place</span>
        <input
          type="text"
          name="place"
          required
          maxLength={120}
          defaultValue={place}
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">
          Default event link <span className="font-normal text-tertiary">(optional)</span>
        </span>
        <input
          type="url"
          name="linked_url"
          inputMode="url"
          defaultValue={linkedUrl ?? ""}
          placeholder="https://lu.ma/…"
          className={INPUT}
        />
        {partifulNote ? <span className="text-xs text-tertiary">{PARTIFUL_NOTE}</span> : null}
      </label>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-accent-strong">
          {state.message}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <button type="submit" className="pls-btn pls-btn--primary pls-btn--sm" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state.status === "saved" ? <span className="text-sm text-secondary">Saved.</span> : null}
      </div>
    </form>
  );
}
