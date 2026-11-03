"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { respond } from "@/actions/respond";
import { verifyCode } from "@/actions/verifyCode";
import { shortLabel } from "@/lib/days";
import type { Answer } from "@/lib/types";
import { Check } from "./atoms";
import { IdentityFields, type Ident } from "./IdentityFields";
import { useToast } from "./Toast";

/**
 * In / out, including dropping after formation. Without a session the first
 * tap opens name + number inline; a known number then asks for its code.
 */
export function PlanActions({
  proposalId,
  me,
  on,
  day,
  signedIn,

}: {
  proposalId: string;
  me: Answer | null;
  on: boolean;
  day: string | null;
  signedIn: boolean;

}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [stage, setStage] = useState<"identity" | "code" | null>(null);
  const [pending, setPending] = useState<Answer | null>(null);
  const [ident, setIdent] = useState<Ident>({ name: "", phone: "", code: "" });
  const [error, setError] = useState<string | null>(null);

  function send(answer: Answer, withIdent: boolean) {
    setError(null);
    start(async () => {
      const r = await respond({ proposalId, answer, ...(withIdent ? { name: ident.name, phone: ident.phone } : {}) });
      if (r.status === "needs_code") {
        setStage("code");
        return;
      }
      if (r.status === "error") {
        if (r.error === "need_identity") {
          setPending(answer);
          setStage("identity");
          return;
        }
        setError(r.message);
        if (!stage) toast(r.message);
        return;
      }
      setStage(null);
      router.refresh();
    });
  }

  function tap(answer: Answer) {
    if (!signedIn) {
      setPending(answer);
      setStage("identity");
      setError(null);
      return;
    }
    send(answer, false);
  }

  function submit() {
    if (stage === "code") {
      setError(null);
      start(async () => {
        const r = await verifyCode({ phone: ident.phone, code: ident.code });
        if (r.status === "error") {
          setError(r.message);
          if (r.error === "expired" || r.error === "too_many") {
            setStage("identity");
            setIdent({ ...ident, code: "" });
          }
          return;
        }
        setStage(null);
        router.refresh();
      });
      return;
    }
    if (pending) send(pending, true);
  }

  return <div className="bar">
    <button className="cta" onClick={() => me !== "in" && tap("in")} disabled={busy} aria-pressed={me === "in"}>
      {me === "in" ? <><Check />You&apos;re in{on && day ? ' \u00b7 ' + shortLabel(day) : ''}</> : "I'm in"}
    </button>
    {on && me === "in" && day ? <><a className="alt" href={`/p/${proposalId}/invite.ics`}>Add to calendar</a><button className="alt" disabled={busy} onClick={() => tap("out")}>Can&apos;t make it</button></> : <button className="alt" disabled={busy} onClick={() => tap("out")}>Can&apos;t make it</button>}
    <IdentityFields signedIn={signedIn} stage={stage} value={ident} onChange={setIdent} onSubmit={submit} busy={busy} error={error} cta={pending === "in" ? "I'm in" : "Can't make it"} />
  </div>;
}
