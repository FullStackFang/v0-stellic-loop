"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { leaveLoopForm } from "@/app/l/[slug]/actions";

/** "Leave this loop" with a confirm step before the form posts. */
export function LeaveControl({
  membershipId,
  slug,
  crewed,
}: {
  membershipId: string;
  slug: string;
  crewed: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" className="pls-btn pls-btn--ghost" onClick={() => setConfirming(true)}>
        Leave this loop
      </button>
    );
  }

  return (
    <form action={leaveLoopForm} className="flex flex-col gap-3">
      <input type="hidden" name="membership_id" value={membershipId} />
      <input type="hidden" name="slug" value={slug} />
      <p className="text-sm text-secondary">
        {crewed ? (
          <>
            You&apos;ll leave your crew and stop getting email for this loop. If you tap back in
            later, you&apos;ll go back into the pool for a new crew.
          </>
        ) : (
          <>
            You&apos;ll stop getting email for this loop and won&apos;t be placed in a crew. You can
            tap back in later.
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-3">
        <ConfirmButton />
        <button type="button" className="pls-btn pls-btn--ghost" onClick={() => setConfirming(false)}>
          Stay
        </button>
      </div>
    </form>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="pls-btn pls-btn--secondary" disabled={pending}>
      {pending ? "Leaving…" : "Yes, leave"}
    </button>
  );
}
