"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startBoard } from "@/actions/board";
import { verifyCode } from "@/actions/verifyCode";
import { Arrow, Sect } from "./atoms";
import { IdentityFields, type Ident } from "./IdentityFields";

/**
 * Start a board: a name, and the starter's name and number on a device with
 * no session. Always rolling, in this browser's timezone; no other controls.
 */
export function StartBoard({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [board, setBoard] = useState("");
  const [stage, setStage] = useState<"identity" | "code" | null>(signedIn ? null : "identity");
  const [ident, setIdent] = useState<Ident>({ name: "", phone: "", code: "" });
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!board.trim()) return setError("Give the board a name.");
    start(async () => {
      if (stage === "code") {
        const r = await verifyCode({ phone: ident.phone, code: ident.code });
        if (r.status === "error") {
          setError(r.message);
          if (r.error === "expired" || r.error === "too_many") setStage("identity");
          return;
        }
        return router.push(r.path ?? "/");
      }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const r = await startBoard({ board, tz, ...(stage === "identity" ? { name: ident.name, phone: ident.phone } : {}) });
      if (r.status === "needs_code") return setStage("code");
      if (r.status === "error") {
        if (r.error === "need_identity") return setStage("identity");
        return setError(r.message);
      }
      router.push(`/b/${r.slug}`);
    });
  }

  return (
    <>
      <Sect lab="Start a board" plain="next two weeks · anyone with the link" />
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="field">
          <label htmlFor="sb-name">Board name</label>
          <input id="sb-name" name="board" placeholder="e.g. Strategy team" value={board} onChange={(e) => setBoard(e.target.value)} maxLength={60} required />
        </div>
        {error && !stage ? <div className="hint" role="alert">{error}</div> : null}
        {!stage ? <button className="pill" type="submit" disabled={busy}>Start a board <Arrow /></button> : null}
      </form>
      <IdentityFields signedIn={signedIn} stage={stage} value={ident} onChange={setIdent} onSubmit={submit} busy={busy} error={stage ? error : null} cta="Start a board" />
    </>
  );
}
