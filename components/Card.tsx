"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { longLabel } from "@/lib/days";
import type { CardModel } from "@/lib/view";
import { Acts } from "./Acts";
import { Ask, LockedLine } from "./Ask";
import { Chip, DateBlock, MiniHeat, Plate } from "./atoms";

/** A board card: facts only. Tapping anywhere but its actions opens the proposal page. */
export function Card({ c, signedIn }: { c: CardModel; signedIn: boolean }) {
  const router = useRouter();
  const live = c.state === "open" || c.state === "ready" || c.state === "on";
  return (
    <article
      className={`card${c.state === "on" ? " on" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-stop], a, button, input")) return;
        router.push(`/p/${c.id}`);
      }}
    >
      <DateBlock d={c.date} />
      <div className="t">
        <div className="titlerow">
          <Plate icon={c.icon} />
          <Link className="title" href={`/p/${c.id}`}>{c.title}</Link>
        </div>
        <div className="facts">
          {c.chip ? <Chip kind={c.chip} /> : null}
          {c.facts.strong ? <b>{c.facts.strong}</b> : null}
          {c.facts.text ? <span>{c.facts.text}</span> : null}
        </div>
        {c.heat && (c.state === "open" || c.state === "ready") ? <MiniHeat heat={c.heat} /> : null}
        {c.ask ? <Ask proposalId={c.id} ask={c.ask} /> : null}
        {c.state === "on" ? <LockedLine proposalId={c.id} dayLong={c.onDay ? longLabel(c.onDay) : null} count={c.inCount} /> : null}
        <div className="facts who">
          {c.faces.length ? (
            <span className="pile">
              {c.faces.map((f, i) => <span key={i} className={`av ${f.cls}`}>{f.initial}</span>)}
              {c.more ? <span className="av more">+{c.more}</span> : null}
            </span>
          ) : null}
          <span>{c.who}</span>
        </div>
        {live ? (
          <Acts proposalId={c.id} me={c.me} on={c.state === "on"} needsDay={c.needsDay} signedIn={signedIn} posterName={c.posterName} />
        ) : null}
        {c.conflict ? (
          <div className="flag">You&apos;re already on for <b>{c.conflict}</b>; that day won&apos;t count for you here.</div>
        ) : null}
        {!c.needsDay && c.state !== "on" && c.state !== "past" && c.me === "in" ? <div className="hint" style={{ marginTop: 8 }}>No day needed</div> : null}
      </div>
    </article>
  );
}
