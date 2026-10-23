"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { lock } from "@/actions/lock";
import type { AskView } from "@/lib/view";
import { Arrow, Check } from "./atoms";
import { markLocked, useJustLocked } from "./justLocked";
import { useToast } from "./Toast";

const KEY = (id: string) => `qb-notyet-${id}`;

/**
 * The ask at quorum. "Not yet" hides it for this viewer only (kept in
 * localStorage); "Lock it in" / "It's on" latches the proposal ON.
 */
export function Ask({ proposalId, ask, style }: { proposalId: string; ask: AskView; style?: React.CSSProperties }) {
  const router = useRouter();
  const toast = useToast();
  const [hidden, setHidden] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      if (localStorage.getItem(KEY(proposalId))) setHidden(true);
    } catch {}
  }, [proposalId]);

  if (hidden) return null;

  if (done) {
    return (
      <div className="ask" style={style}>
        <div className="me"><Check /> Locked{ask.dayLong ? `. ${ask.dayLong}` : ""} · {ask.of} in. Add it to your calendar.</div>
      </div>
    );
  }

  function notYet() {
    try {
      localStorage.setItem(KEY(proposalId), "1");
    } catch {}
    setHidden(true);
    toast("Okay. It stays ready; nothing changes.");
  }

  function go() {
    setError(null);
    start(async () => {
      const r = await lock({ proposalId });
      if (r.status === "error") {
        setError(r.message);
        return;
      }
      markLocked(proposalId);
      setDone(true);
      router.refresh();
    });
  }

  return (
    <div className="ask" style={style} data-stop onClick={(e) => e.stopPropagation()}>
      <span className="q">
        {ask.dayLong ? (
          <>{ask.count} of {ask.of} can do <b>{ask.dayLong}</b>. Lock it in?</>
        ) : (
          <>{ask.count} of you want this. <b>Make it happen?</b></>
        )}
      </span>
      {error ? <span className="err" role="alert">{error}</span> : null}
      <div className="replies">
        <button className="ghost later" onClick={notYet}>Not yet</button>
        <button className="pill go" onClick={go} disabled={busy}>{ask.cta} <Arrow /></button>
      </div>
    </div>
  );
}

/** The confirmation line, shown on the ON card right after this viewer locked it. */
export function LockedLine({ proposalId, dayLong, count }: { proposalId: string; dayLong: string | null; count: number }) {
  const show = useJustLocked(proposalId);
  if (!show) return null;
  return (
    <div className="ask">
      <div className="me"><Check /> Locked{dayLong ? `. ${dayLong}` : ""} · {count} in. Add it to your calendar.</div>
    </div>
  );
}
