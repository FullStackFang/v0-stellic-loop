import Link from "next/link";
import { countedDays, todayIn } from "@/lib/days";
import { SlotEditor } from "./SlotEditor";
import type { Board } from "@/lib/types";
import type { PlanModel } from "@/lib/view";
import { Count } from "./Count";
import { Faces } from "./Faces";
import { ForecastChip } from "./ForecastChip";
import { PlanActions } from "./PlanActions";
import { DetailsBox, type DetailRow } from "./DetailsBox";
import { RHYTHMS } from "@/lib/intent";

export type PlanPageModel = { board: Board; c: PlanModel; details: DetailRow[]; signedIn: boolean; isPoster: boolean; viewerName: string | null };
export function PlanView({ board, c, details, signedIn, isPoster }: PlanPageModel) {
  const ended = c.state === "didnt_form" || c.state === "closed";
  const formed = c.state === "formed" || c.state === "past";
  const tag = c.state === "past" ? `Happened · ${c.when}` : ended ? `${c.state === "didnt_form" ? "Didn't form" : "Closed"} · ${c.count} of ${c.threshold}` : formed ? `Formed · ${c.count} of ${c.threshold}` : `Open · forms at ${c.threshold}`;
  return <>
    <div className="tag"><i /><span>{tag}</span></div><h1>{c.title}</h1>
    <div className="when">{ended ? "Was " : ""}<b>{c.when}</b>{c.place ? <><br />{c.place}</> : null}</div>
    {c.intent.preferences.length || c.intent.rhythm !== "once" ? <div className="plan-preferences">
      <div className="intent-label">Poster’s preferences</div>
      <div className="intent-pins">{c.intent.preferences.map(pin => <span className="intent-pin" key={pin}>@{pin}</span>)}</div>
      {c.intent.rhythm !== "once" ? <p>{RHYTHMS[c.intent.rhythm]} preferred. Each next plan needs a fresh count.</p> : null}
    </div> : null}
    {isPoster && c.state === "open" ? <SlotEditor key={JSON.stringify([c.day,c.time,c.place,c.intent])} id={c.id} title={c.title} intent={c.intent} day={c.day} time={c.time} place={c.place} days={countedDays(board, todayIn(board.tz))} /> : null}
    {ended ? <p>Nobody&apos;s fault.</p> : <ForecastChip sky={c.sky} temperature={c.temperature} time={c.time} />}
    <Count count={c.count} threshold={c.threshold} lead={c.lead} />
    <div className="lead">{ended ? `${c.count} were in. Nobody has to chase anyone.` : formed ? `Formed. One message went to all ${c.count}.` : `${c.remaining === 1 ? "One" : c.remaining} more and it forms.`}</div>
    <Faces faces={c.faces} remaining={formed ? 0 : Math.max(0, c.threshold - c.count)} ended={ended} />
    {c.dropped.map(f => <div className="out" key={f.id}>{f.name || "Someone"} can&apos;t make it</div>)}
    {ended ? <div className="det"><div><span>Try a different night? Posting again starts a fresh count.</span><small>Loop</small></div></div> : <DetailsBox proposalId={c.id} rows={details} canAdd={c.me === "in"} cal={null} />}
    {c.state === "didnt_form" ? <div className="bar"><Link className="cta ghost" href={`/b/${board.slug}/new?again=${c.id}`}>Post it again</Link><Link className="alt" href={`/b/${board.slug}`}>Back to {board.name}</Link></div> : !ended && c.state !== "past" ? <PlanActions proposalId={c.id} me={c.me} on={formed} day={c.day} signedIn={signedIn} /> : null}
  </>;
}
