"use client";
import Link from "next/link";
import { useId } from "react";

export type Ident = { name: string; phone: string; code: string };

/**
 * Name and number, inline under the action, for a device with no session;
 * then the code field for the code we text. Nothing at all when signed in.
 */
export function IdentityFields({
  signedIn,
  stage,
  value,
  onChange,
  onSubmit,
  busy,
  error,
  cta,
}: {
  signedIn: boolean;
  stage: "identity" | "code" | null;
  value: Ident;
  onChange: (v: Ident) => void;
  onSubmit: () => void;
  busy?: boolean;
  error?: string | null;
  cta: string;
}) {
  const id = useId();
  if (signedIn && stage !== "code") return null;
  if (!stage) return null;
  return (
    <form
      className="idf"
      data-stop
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {stage === "identity" ? (
        <>
          <div className="field">
            <label htmlFor={`${id}-n`}>Your name</label>
            <input id={`${id}-n`} name="name" autoComplete="name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor={`${id}-p`}>Your number</label>
            <input id={`${id}-p`} name="phone" type="tel" autoComplete="tel" inputMode="tel" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} required />
            <div className="hint">This is how the group knows it&apos;s you. US numbers only for now.</div>
            <div className="hint">
              We&apos;ll text you a code to confirm it&apos;s your number. Msg &amp; data rates may apply.{" "}
              <Link href="/terms" target="_blank" style={{ textDecoration: "underline" }}>Terms</Link> ·{" "}
              <Link href="/privacy" target="_blank" style={{ textDecoration: "underline" }}>Privacy</Link>
            </div>
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor={`${id}-c`}>Code</label>
          <input id={`${id}-c`} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value })} required autoFocus />
          <div className="hint">Enter the six-digit code we texted you.</div>
        </div>
      )}
      {error ? <div className="err" role="alert">{error}</div> : null}
      <button className="solid" type="submit" disabled={busy}>{stage === "code" ? "Confirm" : cta}</button>
    </form>
  );
}
