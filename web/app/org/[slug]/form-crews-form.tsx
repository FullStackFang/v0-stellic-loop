"use client";

import { useActionState } from "react";
import {
  confirmFormCrews,
  previewFormCrews,
  type FormCrewsState,
  type PreviewCrew,
} from "@/app/org/[slug]/form-crews-actions";

const initialState: FormCrewsState = { status: "idle" };

function people(n: number): string {
  return n === 1 ? "1 member" : `${n} members`;
}

/**
 * The two-step flow. Idle shows the waiting count and "Form crews", which
 * fetches the preview (no hash exists before that). The preview names the
 * proposed crews and offers "Confirm" (posting its hash) and "Cancel" (back
 * to idle, no server call). A tap-in between the two steps comes back as a
 * fresh preview with a message.
 */
async function step(prev: FormCrewsState, formData: FormData): Promise<FormCrewsState> {
  switch (formData.get("step")) {
    case "cancel":
      return { status: "idle" };
    case "confirm":
      return confirmFormCrews(prev, formData);
    default:
      return previewFormCrews(prev, formData);
  }
}

export function FormCrewsForm({ slug, waiting }: { slug: string; waiting: number }) {
  const [state, formAction, pending] = useActionState(step, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="slug" value={slug} />

      {state.status === "formed" ? (
        <p role="status" className="rounded-[var(--radius-md)] bg-blush px-4 py-3 text-sm">
          {`Crews formed. Placed ${people(state.placed)}, emailed ${state.emailed}.`}
          {state.emailFailed > 0
            ? ` ${state.emailFailed} email${state.emailFailed === 1 ? "" : "s"} didn't send; their placements stand.${
                state.emailFailedFirstNames.length > 0
                  ? ` Tell them in person: ${state.emailFailedFirstNames.join(", ")}.`
                  : ""
              }`
            : null}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-accent-strong">
          {state.message}
        </p>
      ) : null}

      {state.status === "preview" ? (
        <PreviewStep state={state} pending={pending} />
      ) : (
        <>
          <p className="text-sm text-secondary">
            <span className="pls-mono font-semibold text-primary">{waiting}</span> eligible and not yet in a crew
          </p>
          {waiting > 0 ? (
            <div>
              <button
                type="submit"
                name="step"
                value="preview"
                className="pls-btn pls-btn--primary pls-btn--sm"
                disabled={pending}
              >
                {pending ? "Working…" : "Form crews"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </form>
  );
}

function PreviewStep({
  state,
  pending,
}: {
  state: Extract<FormCrewsState, { status: "preview" }>;
  pending: boolean;
}) {
  const { placedIntoExisting, newCrewSizes, waiting } = state.counts;
  const nothingToPlace = state.placements.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {state.message ? (
        <p role="status" className="rounded-[var(--radius-md)] bg-blush px-4 py-3 text-sm">
          {state.message}
        </p>
      ) : null}
      <input type="hidden" name="input_hash" value={state.inputHash} />

      {nothingToPlace ? (
        <p className="text-sm text-secondary">
          Nobody to place right now.
          {waiting > 0 ? ` ${people(waiting)} waiting; a new crew needs at least 4.` : null}
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-hairline text-sm" aria-label="Formation preview">
            <li className="flex items-center justify-between py-1.5">
              <span>Joining existing crews</span>
              <span className="pls-mono font-semibold">{placedIntoExisting}</span>
            </li>
            <li className="flex items-center justify-between py-1.5">
              <span>New crews</span>
              <span className="pls-mono font-semibold">
                {newCrewSizes.length === 0
                  ? "0"
                  : `${newCrewSizes.length} (${newCrewSizes.join(", ")} members)`}
              </span>
            </li>
            <li className="flex items-center justify-between py-1.5">
              <span>Still waiting</span>
              <span className="pls-mono font-semibold">{waiting}</span>
            </li>
          </ul>
          <ul className="flex flex-col gap-2 text-sm" aria-label="Proposed crews">
            {state.placements.map((crew, i) => (
              <ProposedCrew key={i} crew={crew} />
            ))}
          </ul>
          <p className="text-xs text-tertiary">
            Confirming saves these crews and emails each newly placed member.
          </p>
        </>
      )}

      <div className="flex items-center gap-3">
        {nothingToPlace ? null : (
          <button
            type="submit"
            name="step"
            value="confirm"
            className="pls-btn pls-btn--primary pls-btn--sm"
            disabled={pending}
          >
            {pending ? "Forming…" : "Confirm"}
          </button>
        )}
        <button
          type="submit"
          name="step"
          value="cancel"
          className="pls-btn pls-btn--secondary pls-btn--sm"
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProposedCrew({ crew }: { crew: PreviewCrew }) {
  const label =
    crew.kind === "new" ? `New crew of ${crew.members.length}` : `Existing crew, now ${crew.members.length}`;
  return (
    <li className="flex flex-col gap-0.5 rounded-[var(--radius-md)] bg-sunken px-4 py-2">
      <span className="font-semibold">{label}</span>
      <span>
        {crew.members.map((m, i) => (
          <span key={i}>
            {i > 0 ? ", " : null}
            {m.firstName}
            {crew.kind === "existing" && m.joining ? <span className="text-tertiary"> (joining)</span> : null}
          </span>
        ))}
      </span>
    </li>
  );
}
