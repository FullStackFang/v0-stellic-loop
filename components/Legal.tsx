import Link from "next/link";
import type { ReactNode } from "react";

/** Wordmark header and one column of plain text, for /privacy and /terms. */
export function Legal({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="app">
      <header className="head"><Link className="wordmark" href="/">Quorum</Link></header>
      <main className="screen">
        <div className="mast" style={{ paddingTop: 14 }}>
          <h2>{title}</h2>
          <p>Last updated {updated}.</p>
        </div>
        <div style={{ padding: "8px 6px 0", fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>{children}</div>
      </main>
    </div>
  );
}
