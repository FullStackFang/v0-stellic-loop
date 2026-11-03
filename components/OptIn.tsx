"use client";
import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setShareWithSteward } from "@/actions/settings";
export function OptIn({ boardId, label, share }: { boardId: string; label: string; share: boolean }) {
  const [on, setOn] = useOptimistic(share), [busy, start] = useTransition(), [error, setError] = useState("");
  const router = useRouter();
  return <div className="optin"><p><b id="steward-label">Let {label} see whether you&apos;re in a standing crew</b>They see yes or no, and how many weeks. Not which crew, not who with, not anything you post.<small>Off by default. Change it any time.</small>{error ? <small role="alert">{error}</small> : null}</p><button className="tog" role="switch" aria-checked={on} aria-labelledby="steward-label" disabled={busy} onClick={() => start(async () => { setOn(!on); const r = await setShareWithSteward(boardId, !on); setError(r.status === "error" ? r.message : ""); router.refresh(); })} /></div>;
}
