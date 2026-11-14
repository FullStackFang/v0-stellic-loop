import Link from "next/link";
import type { ReactNode } from "react";
import { Rings } from "@/components/LoopGlyphs";

const PAGES = [["Privacy", "/privacy"], ["Terms", "/terms"]] as const;

/** The Loop top bar and one readable column on a panel, for /privacy and /terms (app/loop.css). */
export function Legal({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="lp">
      <header className="lp-top"><Link href="/" className="lp-top-mark"><Rings /><span>Loop</span></Link></header>
      <main className="lp-legal">
        <h1>{title}</h1>
        <p className="lp-legal-updated">Last updated {updated}.</p>
        <div className="lp-legal-body">{children}</div>
        <nav className="lp-legal-foot" aria-label="Legal">
          {PAGES.map(([label, href]) => <Link key={href} href={href} aria-current={label === title ? "page" : undefined}>{label}</Link>)}
        </nav>
      </main>
    </div>
  );
}
