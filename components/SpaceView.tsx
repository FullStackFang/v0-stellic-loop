import Link from "next/link";
import type { Board } from "@/lib/types";
import type { PlanModel } from "@/lib/view";
import { PlanRow } from "./PlanRow";
import { CopyLink } from "./CopyLink";
export function SpaceView({ board, open, formed, wrapped, members }: { board: Board; open: PlanModel[]; formed: PlanModel[]; wrapped: PlanModel[]; members: number }) {
  return <><div className="tag">Space · {open.length} open · {formed.length} formed</div><h2>{board.name}</h2><p className="sub">{members} in the space · open to the cohort · plans form at 4</p>
    {!open.length && !formed.length && !wrapped.length ? <p className="sub">Nothing posted yet. Post the first intent and paste the link in the group.</p> : null}
    {open.length ? <><div className="sec"><span>Open</span><span>forms at 4</span></div>{open.map(c => <PlanRow key={c.id} plan={c} />)}</> : null}
    {formed.length ? <><div className="sec"><span>Formed</span></div>{formed.map(c => <PlanRow key={c.id} plan={c} />)}</> : null}
    {wrapped.length ? <details className="wrapped"><summary>Wrapped up · {wrapped.length}</summary><div className="lines">{wrapped.map(c => <Link key={c.id} href={`/p/${c.id}`}>{c.title} — {c.state === "didnt_form" ? `didn't form · ${c.count} of ${c.threshold}` : c.state === "past" ? "happened" : "closed"}</Link>)}</div></details> : null}
    <div className="bar"><Link className="cta" href={`/b/${board.slug}/new`}>Post an intent</Link><CopyLink slug={board.slug} /></div></>;
}
