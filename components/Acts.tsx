"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { respond } from "@/actions/respond";
import { verifyCode } from "@/actions/verifyCode";
import { dayNames, shortLabel } from "@/lib/days";
import type { Answer } from "@/lib/types";
import { Check } from "./atoms";
import { IdentityFields, type Ident } from "./IdentityFields";
import { useToast } from "./Toast";

/**
 * In / maybe / out (in / out-or-drop once ON). Without a session the first
 * tap opens name + number inline; a known number then asks for its code.
 */
export function Acts({
  proposalId,
  me,
  on,
  needsDay,
  signedIn,
  posterName,
}: {
  proposalId: string;
  me: Answer | null;
  on: boolean;
  needsDay: boolean;
  signedIn: boolean;
  posterName: string | null;
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
      if (r.next === "in" && needsDay && !on) {
        toast(
          <>
            You&apos;re in. Your free days attached: <b>{dayNames(r.days).join(", ") || "none yet"}</b>.
            {r.conflict ? <> {shortLabel(r.conflict.day)} is taken by {r.conflict.title}.</> : " Adjust them on the intent's page."}
          </>,
        );
      } else if (on && me === "in" && r.next !== "in") {
        toast(<>Dropped. Still on. <b>{posterName ?? "The poster"} is told</b>, nobody else.</>);
      }
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

  const cls = (a: Answer) => `ghost ${a}${(stage ? pending : me) === a ? " on" : ""}`;
  return (
    <div data-stop onClick={(e) => e.stopPropagation()}>
      <div className="acts">
        <button className={cls("in")} onClick={() => tap("in")} disabled={busy} aria-pressed={me === "in"}>
          {me === "in" ? <><Check /> In</> : "I'm in"}
        </button>
        {!on ? (
          <button className={cls("maybe")} onClick={() => tap("maybe")} disabled={busy} aria-pressed={me === "maybe"}>Maybe</button>
        ) : null}
        <button className={cls("out")} onClick={() => tap("out")} disabled={busy} aria-pressed={me === "out"}>
          {on && me === "in" ? "Drop" : "Out"}
        </button>
      </div>
      <IdentityFields
        signedIn={signedIn}
        stage={stage}
        value={ident}
        onChange={setIdent}
        onSubmit={submit}
        busy={busy}
        error={error}
        cta={pending === "in" ? "I'm in" : pending === "maybe" ? "Maybe" : "Out"}
      />
    </div>
  );
}
