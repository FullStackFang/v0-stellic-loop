import Link from "next/link";
import type { PlanModel } from "@/lib/view";
import { solarStyle } from "@/lib/solarStyle";
import { WeatherGlyph } from "./ForecastChip";
export function PlanRow({ plan: c, status }: { plan: PlanModel; status?: string }) {
  const ended = c.state === "didnt_form" || c.state === "closed";
  return <Link className={`row${ended ? " dead" : ""}`} href={`/p/${c.id}`} style={solarStyle(c.hour, c.sky, ended)}>
    <div><div className="t">{c.title}</div>{c.day || c.time || c.place ? <div className="s">{c.when}{c.place ? ` · ${c.place}` : ""}</div> : null}
      <div className="st"><i />{status ?? (ended ? `${c.state === "didnt_form" ? "didn't form" : "closed"} · ${c.count} of ${c.threshold}` : c.state === "open" ? `${c.remaining === 1 ? "One" : c.remaining} more and it forms` : "Formed")}</div>
      <div className="stack" aria-label={`${c.count} people in`}>{c.faces.slice(0, 5).map(f => <span className="face" key={f.id} title={f.name}>{f.initial}</span>)}{c.state === "open" ? Array.from({ length: Math.min(c.remaining, 5) }, (_, i) => <span key={i} className="face slot" />) : null}</div>
    </div><span className="wx"><WeatherGlyph sky={c.sky} /></span><div className="n"><span className="num">{c.count}{c.state === "open" ? <small>/{c.threshold}</small> : null}</span>{c.state === "open" ? <div className="mini" aria-hidden="true">{Array.from({ length: c.threshold }, (_, i) => <b key={i} className={i < c.count ? "f" : ""} />)}</div> : <span className="tagx">{ended ? "closed" : "in · join"}</span>}</div>
  </Link>;
}
