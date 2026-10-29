"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const APP = [
  ["Board", "/b/emba27"],
  ["Post", "/b/emba27/new"],
  ["You", "/b/emba27/you"],
  ["Start a board", "/"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
] as const;

const DEMOS = [
  ["Loop demo", "stellic"],
  ["Quorum prototype v5", "quorum"],
] as const;

const MOCKUPS = {
  Quorum: [
    ["Luma, aigma, HAI, Delta", "quorum-calm"], ["Delta mixes", "quorum-delta"], ["Fun directions", "quorum-fun"],
    ["Orbits", "quorum-fx"], ["Light hero fields", "quorum-hero"], ["Vendor side", "vendor"],
  ],
  Loop: [
    ["Home feed", "home-feed"], ["Home blend", "home-blend"], ["Home chips", "home-chips"], ["Home filters", "home-filters"], ["Home v2", "home-v2"],
    ["Intent", "intent"], ["Intent @ pins", "intent-at"], ["Intent pills", "intent-pills"],
    ["Anchor", "anchor"], ["Anchor detail", "anchor-detail"], ["Anchor minimal", "anchor-min"], ["Anchor tiles", "anchor-tile"],
    ["Loop card", "loop-card"], ["Loop card v2", "loop-card-v2"], ["Loop card v3", "loop-card-v3"], ["Loop card v4", "loop-card-v4"], ["Loop card v5", "loop-card-v5"],
    ["Advisor", "advisor"], ["Advisor v2 tabs", "advisor-tabs"], ["Advisor v3", "advisor-b"], ["Advisor v4 dial", "advisor-dial"],
    ["Staff personas", "staff-personas"], ["You hub", "you-hub"], ["Onboarding", "onboarding"], ["Header", "header"],
    ["Buttons", "buttons"], ["Ranking", "ranking-personalization"], ["Redundancy cuts", "redundancy"],
  ],
} as const;

/** Laptop-only menu beside the phone: the live app's screens, then the static demos and mockups (new tab). */
export function SiteNav() {
  const path = usePathname();
  return (
    <nav className="sitenav" aria-label="Site">
      <p className="lab">App</p>
      {APP.map(([label, href]) => (
        <Link key={href} href={href} className={path === href ? "on" : ""} aria-current={path === href ? "page" : undefined}>{label}</Link>
      ))}
      <p className="lab">Demos</p>
      {DEMOS.map(([label, page]) => <a key={page} href={`/demo/${page}`} target="_blank" rel="noopener">{label}</a>)}
      {Object.entries(MOCKUPS).map(([group, items]) => (
        <details key={group}>
          <summary className="lab">{group} mockups</summary>
          {items.map(([label, page]) => <a key={page} href={`/demo/mockups-${page}`} target="_blank" rel="noopener">{label}</a>)}
        </details>
      ))}
    </nav>
  );
}
