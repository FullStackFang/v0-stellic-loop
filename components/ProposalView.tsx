import Link from "next/link";
import { shortLabel, dow, windowDays } from "@/lib/days";
import type { Board } from "@/lib/types";
import { longLabel } from "@/lib/days";
import type { CardModel, PersonRow } from "@/lib/view";
import { Acts } from "./Acts";
import { Ask, LockedLine } from "./Ask";
import { Chip, MiniHeat, Plate, Sect } from "./atoms";
import { DayStrip } from "./DayStrip";
import { DetailsBox, type DetailRow } from "./DetailsBox";
import { PosterControls } from "./PosterControls";
import { ShareButton } from "./ShareButton";

export type ProposalPageModel = {
  board: Board;
  c: CardModel;
  details: DetailRow[];
  people: { in: PersonRow[]; maybe: PersonRow[] };
  signedIn: boolean;
  isPoster: boolean;
};

/** The card expanded: heat, your days, the ask, details, who's in, share. */
export function ProposalView({ board, c, details, people, signedIn, isPoster }: ProposalPageModel) {
  const live = c.state === "open" || c.state === "ready" || c.state === "on";
  const isOn = c.state === "on" || (c.state === "past" && !!c.lockedByName);
  const chip =
    c.state === "on" ? <Chip kind="on">On · {c.onDay ? shortLabel(c.onDay) : `${c.inCount} in`}</Chip>
    : c.state === "ready" ? <Chip kind="ready" />
    : c.state === "idled" ? <Chip kind="open">Idled</Chip>
    : c.state === "closed" ? <Chip kind="open">Closed</Chip>
    : c.state === "past" ? <Chip kind="open">Past</Chip>
    : <Chip kind="open" />;
  const meta = [c.cost, c.min !== 4 ? `needs ${c.min}` : "quorum 4", c.posterName && `started by ${c.posterName}`].filter(Boolean).join(" · ");
  const rows: DetailRow[] = [...(c.time ? [{ k: "time", text: c.time, url: null, by: c.posterName }] : []), ...details];
  const cal = c.needsDay && (isOn || c.state === "ready")
    ? { text: isOn ? "One all-day invite for everyone in" : "An invite is ready once it's locked", href: isOn && c.onDay ? `/p/${c.id}/invite.ics` : null }
    : null;

  return (
    <div className="page">
      <div className="phead">
        <Plate icon={c.icon} lg />
        <div>
          <h1 className="ptitle" style={{ margin: 0 }}>{c.title}</h1>
          <div className="pmeta">
            {isOn && c.lockedByName ? <><b>{c.lockedByName} locked it{c.time ? ` · ${c.time}` : ""}</b><br /></> : null}
            {meta}
          </div>
        </div>
        {chip}
      </div>
      {c.detail ? <p className="pbody">{c.detail}</p> : null}

      {c.needsDay && c.heat ? (
        <>
          <Sect lab={isOn ? "Locked day" : "Who can do which day"} plain={isOn && c.onDay ? shortLabel(c.onDay) : c.bestDay ? `${c.bestCount} on ${dow(c.bestDay)}` : "no days yet"} />
          <MiniHeat heat={c.heat} style={{ marginTop: 0 }} />
          {c.me === "in" && (c.state === "open" || c.state === "ready") ? (
            <>
              <p className="hint" style={{ margin: "12px 0 8px" }}>Your days for this one (the dot). Tap to adjust.</p>
              <DayStrip days={windowDays(board.window_start, board.window_end)} selected={c.myDays} proposalId={c.id} compact />
            </>
          ) : c.state === "open" || c.state === "ready" ? (
            <p className="hint" style={{ margin: "10px 0 0" }}>Tap in and your free days land here.</p>
          ) : null}
        </>
      ) : (
        <Sect lab="Day" plain="None needed" />
      )}
      {c.ask ? <Ask proposalId={c.id} ask={c.ask} style={c.needsDay ? undefined : { marginTop: 0 }} /> : null}
      {c.state === "on" ? <LockedLine proposalId={c.id} dayLong={c.onDay ? longLabel(c.onDay) : null} count={c.inCount} /> : null}
      {live ? <Acts proposalId={c.id} me={c.me} on={c.state === "on"} needsDay={c.needsDay} signedIn={signedIn} posterName={c.posterName} /> : null}
      {c.conflict ? <div className="flag">You&apos;re already on for <b>{c.conflict}</b>; that day won&apos;t count for you here.</div> : null}

      <Sect lab="Details" plain="Anyone in can add · title is fixed" />
      <DetailsBox proposalId={c.id} rows={rows} canAdd={c.me === "in" && c.state !== "closed"} cal={cal} />

      <Sect lab="In" n={c.inCount} plain={c.maybeCount ? `${c.inCount} in · ${c.maybeCount} maybe` : undefined} />
      <div className="people">
        {people.in.map((p, i) => <PersonLine key={`i${i}`} p={p} />)}
        {people.maybe.map((p, i) => <PersonLine key={`m${i}`} p={p} maybe />)}
        {!people.in.length && !people.maybe.length ? <div className="empty">Nobody yet.</div> : null}
      </div>

      <div className="acts">
        <ShareButton proposalId={c.id} />
        <Link className="ghost" href={`/b/${board.slug}/new?from=${c.id}`}>Post a version</Link>
      </div>
      {isPoster ? (
        <PosterControls proposalId={c.id} detail={c.detail} time={c.time} idled={c.state === "idled"} closed={c.state === "closed"} min={c.min} />
      ) : null}
      <Link className="solid quiet" href={`/b/${board.slug}`}>Back to the board</Link>
    </div>
  );
}

function PersonLine({ p, maybe }: { p: PersonRow; maybe?: boolean }) {
  const initial = p.me ? "Y" : p.name.startsWith("+1") ? "+" : p.name.slice(0, 1).toUpperCase();
  return (
    <div className={`person${p.me ? " me" : ""}`}>
      <span className={`av${p.me ? " me" : p.name.startsWith("+1") ? " more" : ""}${maybe ? " maybe" : ""}`}>{initial}</span>
      <span>{p.name}</span>
      <span className="s">{maybe ? "maybe" : p.days}</span>
    </div>
  );
}
