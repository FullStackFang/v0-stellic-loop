"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { editProposal } from "@/actions/details";
import { closeProposal, reopenProposal } from "@/actions/lifecycle";
import { useToast } from "./Toast";

/** Only the poster sees this: edit the line and the time, close, or reopen an idled one (lower; on a rolling board, the same or lower). */
export function PosterControls({ proposalId, detail, time, idled, closed, min, rolling = false }: { proposalId: string; detail: string | null; time: string | null; idled: boolean; closed: boolean; min: number; rolling?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [d, setD] = useState(detail ?? "");
  const [t, setT] = useState(time ?? "");
  const top = rolling ? min : min - 1;
  const [lower, setLower] = useState(String(Math.max(1, top)));

  const run = (fn: () => Promise<{ status: string; message?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r.status === "error") toast(r.message);
      else {
        toast(ok);
        router.refresh();
      }
    });

  if (closed) return null;
  return (
    <>
      <div className="sect"><span className="lab">Yours</span><span className="plain">title, number and cost are fixed</span></div>
      <form className="group" style={{ padding: 14 }} onSubmit={(e) => { e.preventDefault(); run(() => editProposal({ proposalId, detail: d, time: t }), "Saved. Nobody is told."); }}>
        <div className="field"><label htmlFor="pc-d">One line</label><input id="pc-d" value={d} onChange={(e) => setD(e.target.value)} maxLength={200} /></div>
        <div className="field"><label htmlFor="pc-t">Time</label><input id="pc-t" value={t} onChange={(e) => setT(e.target.value)} maxLength={40} /></div>
        <button className="solid quiet" type="submit" disabled={busy} style={{ marginTop: 0 }}>Save</button>
      </form>
      {idled && top >= 1 ? (
        <form className="group" style={{ padding: 14, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); run(() => reopenProposal({ proposalId, min: Number(lower) }), "Reopened. Nothing was sent."); }}>
          <div className="field"><label htmlFor="pc-m">Reopen at</label><input id="pc-m" type="number" min={1} max={top} value={lower} onChange={(e) => setLower(e.target.value)} /><div className="hint">{rolling ? `${min} or lower. Answers are kept; it stays open for the next two weeks.` : `Lower than ${min}. Answers are kept; it stays open to the end of the window.`}</div></div>
          <button className="solid" type="submit" disabled={busy} style={{ marginTop: 0 }}>Reopen</button>
        </form>
      ) : null}
      <button className="solid quiet" disabled={busy} onClick={() => { if (confirm("Close this? It moves to past and can't be reopened.")) run(() => closeProposal({ proposalId }), "Closed."); }}>
        Close it
      </button>
    </>
  );
}
