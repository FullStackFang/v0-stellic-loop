"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { post } from "@/actions/post";
import { verifyCode } from "@/actions/verifyCode";
import { emptyIntent, parseIntent, serializeIntent, type Intent } from "@/lib/intent";
import { IntentComposer } from "./IntentComposer";
import { Arrow } from "./atoms";
import { IdentityFields, type Ident } from "./IdentityFields";

export type PostPrefill = { versionOf: string; title: string; day: string | null; time: string | null; place: string | null; intent?: Intent };
export function PostForm({ slug, signedIn, from, days }: { slug: string; signedIn: boolean; from: PostPrefill | null; days: string[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [raw, setRaw] = useState(() => from ? serializeIntent({ title: from.title, day: from.day && days.includes(from.day) ? from.day : "", time: from.time ?? "", place: from.place ?? "", intent: from.intent ?? emptyIntent() }) : "");
  const { title, day, time, place, intent, errors } = parseIntent(raw, days);
  const [stage, setStage] = useState<"identity" | "code" | null>(null);
  const [ident, setIdent] = useState<Ident>({ name: "", phone: "", code: "" });
  const [error, setError] = useState<string | null>(null);

  function submit(withIdent: boolean) {
    if (errors.length) return setError(errors[0]);
    setError(null);
    start(async () => {
      const r = await post({
        slug, title, day, time, place, intent, versionOf: from?.versionOf,
        ...(withIdent ? { name: ident.name, phone: ident.phone } : {}),
      });
      if (r.status === "needs_code") return setStage("code");
      if (r.status === "error") {
        if (r.error === "need_identity") return setStage("identity");
        return setError(r.message);
      }
      router.push(`/p/${r.proposalId}`);
    });
  }

  function onPost() {
    if (errors.length) return setError(errors[0]);
    if (!signedIn && !stage) return setStage("identity");
    submit(stage === "identity");
  }

  function onIdentity() {
    if (stage === "identity") return submit(true);
    start(async () => {
      const r = await verifyCode({ phone: ident.phone, code: ident.code });
      if (r.status === "error") {
        setError(r.message);
        if (r.verified) { setStage(null); router.refresh(); }
        else if (r.error === "expired" || r.error === "too_many") { setStage("identity"); setIdent({ ...ident, code: "" }); }
        return;
      }
      if (r.path) router.push(r.path);
    });
  }

  return <div className="page post-page">
    <h1 className="ptitle">{from ? "Post it again" : "What are you up for?"}</h1>
    <p className="pbody">Say what you want. Leave the rest open.</p>
    <form onSubmit={e=>{e.preventDefault();onPost();}}>
      <IntentComposer value={raw} onChange={setRaw} days={days} disabled={busy || stage === "code"} />
      <p className="intent-quorum">You’re the first yes. A plan forms at 4.</p>
      {error && !stage ? <div className="err" role="alert">{error}</div>:null}
      {!stage?<button className="solid" type="submit" disabled={busy}>Post an intent <Arrow/></button>:null}
    </form>
    <IdentityFields signedIn={signedIn} stage={stage} value={ident} onChange={setIdent} onSubmit={onIdentity} busy={busy} error={stage?error:null} cta="Post an intent"/>
    <Link className="cancel" href={'/b/'+slug}>Cancel</Link>
  </div>;
}
