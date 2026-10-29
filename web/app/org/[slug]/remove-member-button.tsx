"use client";

import { useActionState } from "react";
import { removeMember, type RemoveMemberState } from "@/app/org/[slug]/actions";

const initialState: RemoveMemberState = { status: "idle" };

/** Removes one member after a confirm; same effect as the member leaving. */
export function RemoveMemberButton({
  slug,
  membershipId,
  firstName,
}: {
  slug: string;
  membershipId: string;
  firstName: string;
}) {
  const [state, formAction, pending] = useActionState(removeMember, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Remove ${firstName} from this loop?`)) e.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="membership_id" value={membershipId} />
      <button type="submit" className="pls-btn pls-btn--ghost pls-btn--sm" disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </button>
      {state.status === "error" ? (
        <span role="alert" className="text-xs text-accent-strong">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
