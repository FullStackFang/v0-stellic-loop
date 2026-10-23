"use client";
import { useTransition } from "react";
import { share } from "@/actions/share";
import { useToast } from "./Toast";

/** Mints a fresh share URL (fresh preview, attributed to you) and copies it. */
export function ShareButton({ proposalId }: { proposalId: string }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  return (
    <button
      className="ghost"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await share({ proposalId });
          if (r.status === "error") {
            toast(r.message);
            return;
          }
          try {
            await navigator.clipboard.writeText(r.url);
            toast(<>Link copied: <b>{r.url.replace(/^https?:\/\//, "")}</b>. Fresh preview, attributed to you.</>);
          } catch {
            toast(<>Copy this link: <b>{r.url}</b></>);
          }
        })
      }
    >
      Share ↗
    </button>
  );
}
