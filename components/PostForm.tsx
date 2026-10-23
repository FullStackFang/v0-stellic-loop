"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { post } from "@/actions/post";
import { verifyCode } from "@/actions/verifyCode";
import { DEFAULT_ICON, ICON_KEYS, plateStyle } from "@/lib/icons";
import { Arrow, Glyph } from "./atoms";
import { IdentityFields, type Ident } from "./IdentityFields";

export type PostPrefill = {
  versionOf: string;
  title: string;
  icon: string;
  detail: string | null;
  cost: string | null;
  time: string | null;
  min: number | null;
  needsDay: boolean;
};

/** Title and the day switch are enough; everything else is behind "More". */
export function PostForm({ slug, signedIn, from }: { slug: string; signedIn: boolean; from: PostPrefill | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [icon, setIcon] = useState(from?.icon ?? DEFAULT_ICON);
  const [title, setTitle] = useState(from?.title ?? "");
  const [more, setMore] = useState(!!from);
  const [detail, setDetail] = useState(from?.detail ?? "");
  const [cost, setCost] = useState(from?.cost ?? "");
  const [time, setTime] = useState(from?.time ?? "");
  const [min, setMin] = useState(from?.min ? String(from.min) : "");
  const [links, setLinks] = useState("");
  const [needsDay, setNeedsDay] = useState(from?.needsDay ?? true);
  const [stage, setStage] = useState<"identity" | "code" | null>(null);
  const [ident, setIdent] = useState<Ident>({ name: "", phone: "", code: "" });
  const [error, setError] = useState<string | null>(null);

  function submit(withIdent: boolean) {
    setError(null);
    start(async () => {
      const r = await post({
        slug, title, icon, needsDay, detail, cost, time, min, links, versionOf: from?.versionOf,
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
      if (r.status === "error") return setError(r.message);
      if (r.proposalId) router.push(`/p/${r.proposalId}`);
    });
  }

  return (
    <div className="page">
      <h1 className="ptitle" style={{ margin: 0 }}>{from ? "Post a version" : "Post an intent"}</h1>
      <p className="pbody" style={{ marginTop: 6 }}>
        Pick an icon, type a title. You&apos;re in automatically; your free days attach. Everything else is optional and can be added later, by anyone in.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); onPost(); }}>
        <div className="field" style={{ marginTop: 16 }}>
          <label id="pf-icon">Icon</label>
          <div className="picker" role="radiogroup" aria-labelledby="pf-icon">
            {ICON_KEYS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={k === icon} aria-label={k} className={k === icon ? "sel" : ""} style={k === icon ? (plateStyle(k) as CSSProperties) : undefined} onClick={() => setIcon(k)}>
                <Glyph icon={k} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="pf-title">What</label>
          <input id="pf-title" placeholder="e.g. Suits in Hoi An" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </div>
        <button type="button" className="morebtn" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? "Less" : "More"} <span>one line · cost · time · a number · links</span>
        </button>
        {more ? (
          <div>
            <div className="field"><label htmlFor="pf-detail">One line</label><input id="pf-detail" placeholder="Where, roughly what, anything they need to know" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={200} /></div>
            <div className="grid2">
              <div className="field"><label htmlFor="pf-cost">Rough cost</label><input id="pf-cost" placeholder="e.g. ~$250" value={cost} onChange={(e) => setCost(e.target.value)} maxLength={40} /></div>
              <div className="field"><label htmlFor="pf-time">Time</label><input id="pf-time" placeholder="e.g. 3:00pm" value={time} onChange={(e) => setTime(e.target.value)} maxLength={40} /></div>
            </div>
            <div className="field">
              <label htmlFor="pf-min">Needs this many</label>
              <input id="pf-min" type="number" min={1} max={999} placeholder="Leave blank for 4" value={min} onChange={(e) => setMin(e.target.value)} />
              <div className="hint">The overlap on one day that brings up the ask.</div>
            </div>
            <div className="field"><label htmlFor="pf-links">Links, one per line</label><textarea id="pf-links" rows={2} placeholder="Website, Google Doc, Maps" value={links} onChange={(e) => setLinks(e.target.value)} /></div>
          </div>
        ) : null}
        <div className="group">
          <div className="toggle">
            <div id="pf-day">Needs a day<small>Off for things like a shirt order</small></div>
            <button type="button" role="switch" aria-checked={needsDay} aria-labelledby="pf-day" className={`sw${needsDay ? " on" : ""}`} onClick={() => setNeedsDay(!needsDay)}><i /></button>
          </div>
        </div>
        {error && !stage ? <div className="err" role="alert">{error}</div> : null}
        {!stage ? <button className="solid red" type="submit" disabled={busy}>Post <Arrow /></button> : null}
      </form>
      <IdentityFields signedIn={signedIn} stage={stage} value={ident} onChange={setIdent} onSubmit={onIdentity} busy={busy} error={stage ? error : null} cta="Post" />
      <Link className="solid quiet" href={`/b/${slug}`}>Cancel</Link>
    </div>
  );
}
