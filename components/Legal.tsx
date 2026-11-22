import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFoot } from "@/components/campus/foot";
import { PlainShell } from "@/components/campus/shell";
import { TopBar } from "@/components/campus/top-bar";
import { LegalSpy } from "./legal-spy";
import "./legal.css";

const PAGES = [["Terms", "/terms"], ["Privacy", "/privacy"]] as const;
/** One part of a legal page: its name, the short answer in plain words, and the exact wording. */
export type LegalPart = { id: string; name: string; short: string; full: ReactNode };

/**
 * /privacy and /terms in the campus look (components/legal.css): the app's bar, a band with the title, a strip of the
 * parts, then one sheet with each part's short answer beside its exact wording, and the foot.
 */
export function Legal({ title, updated, gist, parts }: { title: string; updated: string; /** One line under the title. */ gist: string; parts: LegalPart[] }) {
  return (
    <PlainShell>
      <div className="cs cs-lg">
        <TopBar account={null} />
        <main>
          <div className="cs-lg-head">
            <nav className="cs-lg-switch" aria-label="Legal">
              {PAGES.map(([label, href]) => <Link key={href} href={href} aria-current={label === title ? "page" : undefined}>{label}</Link>)}
              <small>Updated {updated}</small>
            </nav>
            <h1>{title}</h1>
            <p>{gist}</p>
          </div>
          <nav className="cs-lg-jump" aria-label={`${title}, by part`}>{parts.map(part => <a key={part.id} href={`#${part.id}`}>{part.name}</a>)}</nav>
          <div className="cs-lg-body"><div className="cs-lg-sheet">
            <div className="cs-lg-read" aria-hidden="true"><i /></div>
            {parts.map(part => <section className="cs-lg-row" id={part.id} key={part.id}>
              <div className="cs-lg-short"><h2>{part.name}</h2><p>{part.short}</p></div>
              <p className="cs-lg-exact">{part.full}</p>
            </section>)}
          </div></div>
        </main>
      </div>
      <SiteFoot />
      <LegalSpy />
    </PlainShell>
  );
}
