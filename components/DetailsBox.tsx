"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDetail } from "@/actions/details";
import { useToast } from "./Toast";

export type DetailRow = { k: string; text: string; url: string | null; by: string | null };

const LABEL: Record<string, string> = { where: "Where", link: "Link", note: "Note", time: "Time", cal: "Cal" };

/** Details anyone in can add to; each line shows who added it. Nobody is told. */
export function DetailsBox({ proposalId, rows, canAdd, cal }: { proposalId: string; rows: DetailRow[]; canAdd: boolean; cal: { text: string; href: string | null } | null }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, start] = useTransition();

  function add() {
    const v = text.trim();
    if (!v) return;
    start(async () => {
      const r = await addDetail({ proposalId, text: v });
      if (r.status === "error") {
        toast(r.message);
        return;
      }
      setText("");
      toast(<>Added, attributed to <b>you</b>. Nobody is told about details.</>);
      router.refresh();
    });
  }

  return (
    <div className="details">
      {rows.map((r, i) => (
        <div className="drow" key={i}>
          <span className="k">{LABEL[r.k] ?? r.k}</span>
          <span>{r.url ? <a className="chipl" href={r.url} target="_blank" rel="noopener noreferrer">{r.text} ↗</a> : r.text}</span>
          {r.by ? <span className="by">{r.by}</span> : null}
        </div>
      ))}
      {cal ? (
        <div className="drow">
          <span className="k">Cal</span>
          <span>{cal.text}</span>
          {cal.href ? <a className="chipl" href={cal.href}>Add to calendar</a> : null}
        </div>
      ) : null}
      {canAdd ? (
        <form className="addrow" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input aria-label="Add a link, a place, a note" placeholder="Add a link, a place, a note" value={text} onChange={(e) => setText(e.target.value)} maxLength={280} />
          <button className="ghost" type="submit" disabled={busy}>Add</button>
        </form>
      ) : (
        <div className="drow" style={{ color: "var(--ink-3)" }}>Tap in to add details.</div>
      )}
    </div>
  );
}
