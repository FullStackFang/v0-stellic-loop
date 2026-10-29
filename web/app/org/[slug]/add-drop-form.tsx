"use client";

import { useActionState } from "react";
import { addDrop, type AddDropState } from "@/app/org/[slug]/actions";
import { CopyButton } from "@/app/org/[slug]/copy-button";
import { DROP_KINDS } from "@/lib/organizer-shared";

const initialState: AddDropState = { status: "idle" };

const INPUT =
  "min-h-11 rounded-[var(--radius-md)] bg-sunken px-4 text-base text-primary placeholder:text-tertiary";

/** Adds a labeled share link; shows the new URL with a copy control. */
export function AddDropForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState(addDrop, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="slug" value={slug} />
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">New drop</span>
          <input
            type="text"
            name="label"
            required
            maxLength={60}
            placeholder="Donlon 2F GroupMe"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Kind</span>
          <select name="kind" required defaultValue="group_chat" className={INPUT}>
            {DROP_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-accent-strong">
          {state.message}
        </p>
      ) : null}
      {state.status === "added" ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-secondary">
          Added. <span className="pls-mono break-all">{state.url}</span>
          <CopyButton text={state.url} />
        </p>
      ) : null}
      <div>
        <button type="submit" className="pls-btn pls-btn--secondary pls-btn--sm" disabled={pending}>
          {pending ? "Adding…" : "Add drop"}
        </button>
      </div>
    </form>
  );
}
