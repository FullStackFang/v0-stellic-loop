"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { post } from "@/actions/post";
import { verifyCode } from "@/actions/verifyCode";
import { shortLabel } from "@/lib/days";
import { Arrow } from "./atoms";
import { IdentityFields, type Ident } from "./IdentityFields";

export type PostPrefill = { versionOf: string; title: string; day: string | null; time: string | null; place: string | null };
export function PostForm({ slug, signedIn, from, days }: { slug: string; signedIn: boolean; from: PostPrefill | null; days: string[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [title, setTitle] = useState(from?.title ?? "");
  const [day, setDay] = useState(from?.day && days.includes(from.day) ? from.day : "");
  const [time, setTime] = useState(from?.time ?? "");
  const [place, setPlace] = useState(from?.place ?? "");
  const [stage, setStage] = useState<"identity" | "code" | null>(null);
  const [ident, setIdent] = useState<Ident>({ name: "", phone: "", code: "" });
  const [error, setError] = useState<string | null>(null);

  function submit(withIdent: boolean) {
    setError(null);
    start(async () => {
      const r = await post({
        slug, title, day, time, place, versionOf: from?.versionOf,
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
    if (!title.trim()) return setError("Give it a title.");
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

  return <div className="page">
    <h1 className="ptitle">{from ? "Post it again" : "Post an intent"}</h1>
    <p className="pbody">A title is enough. You&apos;re in automatically. Day, time and place are optional.</p>
    <form onSubmit={e=>{e.preventDefault();onPost();}}>
      <div className="field"><label htmlFor="pf-title">What</label><input id="pf-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={80} required /></div>
      <div className="field"><label id="pf-day">Day</label><div className="days" role="group" aria-labelledby="pf-day"><button type="button" aria-pressed={!day} onClick={()=>setDay("")}>Any day</button>{days.map(d=><button key={d} type="button" aria-pressed={day===d} onClick={()=>setDay(d)}>{shortLabel(d)}</button>)}</div></div>
      <div className="field"><label htmlFor="pf-time">Time</label><input id="pf-time" placeholder="7:30pm" value={time} onChange={e=>setTime(e.target.value)} maxLength={40}/></div>
      <div className="field"><label htmlFor="pf-place">Place</label><input id="pf-place" value={place} onChange={e=>setPlace(e.target.value)} maxLength={200}/></div>
      {error && !stage ? <div className="err" role="alert">{error}</div>:null}
      {!stage?<button className="solid" type="submit" disabled={busy}>Post an intent <Arrow/></button>:null}
    </form>
    <IdentityFields signedIn={signedIn} stage={stage} value={ident} onChange={setIdent} onSubmit={onIdentity} busy={busy} error={stage?error:null} cta="Post an intent"/>
    <Link className="solid quiet" href={'/b/'+slug}>Cancel</Link>
  </div>;
}
