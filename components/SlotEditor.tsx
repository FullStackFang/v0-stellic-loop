"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeProposal } from "@/actions/lifecycle";
import { editProposal } from "@/actions/details";
import { shortLabel } from "@/lib/days";
export function SlotEditor({ id, days, day: initialDay, time: initialTime, place: initialPlace }: { id: string; days: string[]; day: string | null; time: string | null; place: string | null }) {
  const [day, setDay] = useState(initialDay ?? ""), [time, setTime] = useState(initialTime ?? ""), [place, setPlace] = useState(initialPlace ?? "");
  const [busy, start] = useTransition(), [error, setError] = useState(""); const router = useRouter();
  return <details className="slot-edit"><summary>Edit day, time and place</summary><form onSubmit={e => { e.preventDefault(); start(async () => { const r = await editProposal({ proposalId: id, day, time, place }); setError(r.status === "error" ? r.message : ""); router.refresh(); }); }}>
    <div className="days" role="group" aria-label="Plan day"><button type="button" aria-pressed={!day} onClick={() => setDay("")}>Any day</button>{days.map(d => <button key={d} type="button" aria-pressed={day === d} onClick={() => setDay(d)}>{shortLabel(d)}</button>)}</div>
    <div className="field"><label htmlFor="slot-time">Time</label><input id="slot-time" value={time} onChange={e => setTime(e.target.value)} maxLength={40} /></div><div className="field"><label htmlFor="slot-place">Place</label><input id="slot-place" value={place} onChange={e => setPlace(e.target.value)} maxLength={200} /></div>
    {error ? <p role="alert">{error}</p> : null}<button className="ghost" disabled={busy}>Save slot</button>
  </form><button className="alt" disabled={busy} onClick={() => start(async () => { const r = await closeProposal({proposalId:id}); setError(r.status === "error" ? r.message : ""); router.refresh(); })}>Close plan</button></details>;
}
