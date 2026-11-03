"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeProposal } from "@/actions/lifecycle";
import { editProposal } from "@/actions/details";
import { emptyIntent, parseIntent, serializeIntent, type Intent } from "@/lib/intent";
import { IntentComposer } from "./IntentComposer";
export function SlotEditor({ id, title, intent = emptyIntent(), days, day, time, place }: { id: string; title: string; intent?: Intent; days: string[]; day: string | null; time: string | null; place: string | null }) {
  const [raw, setRaw] = useState(() => serializeIntent({ title, day: day ?? "", time: time ?? "", place: place ?? "", intent }));
  const [busy, start] = useTransition(), [error, setError] = useState(""); const router = useRouter();
  return <details className="slot-edit"><summary>Edit day, time, place and preferences</summary><form onSubmit={e => { e.preventDefault();
    const draft = parseIntent(raw, days);
    if (draft.errors.length) return setError(draft.errors[0]);
    start(async () => { const r = await editProposal({ proposalId: id, day: draft.day, time: draft.time, place: draft.place, intent: draft.intent }); setError(r.status === "error" ? r.message : ""); router.refresh(); });
  }}>
    <IntentComposer value={raw} onChange={setRaw} days={days} disabled={busy} fixedTitle />
    {error ? <p role="alert">{error}</p> : null}<button className="ghost" disabled={busy}>Save changes</button>
  </form><button className="alt" disabled={busy} onClick={() => start(async () => { const r = await closeProposal({proposalId:id}); setError(r.status === "error" ? r.message : ""); router.refresh(); })}>Close plan</button></details>;
}
