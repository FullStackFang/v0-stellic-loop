import Link from "next/link";
import { dayNames, shortLabel, stripLabel, todayIn, windowDaysOf } from "@/lib/days";
import type { Board } from "@/lib/types";
import type { CardModel } from "@/lib/view";
import { Chip, DateBlock, Plate, Sect } from "./atoms";
import { DayStrip } from "./DayStrip";
import { ShowNameSwitch } from "./ShowNameSwitch";

/** Your free days for the window, the name switch, and what you're in. */
export function YouView({ board, me, free, mine, today = todayIn(board.tz) }: { board: Board; me: { show_name: boolean } | null; free: string[]; mine: CardModel[]; today?: string }) {
  if (!me) {
    return (
      <div className="mast" style={{ paddingTop: 14 }}>
        <h2>Your <em>week</em></h2>
        <p>Tap in on something on the board first; your days live here after that.</p>
        <p style={{ marginTop: 16 }}><Link className="pill" href={`/b/${board.slug}`}>To the board</Link></p>
      </div>
    );
  }
  return (
    <>
      <div className="mast" style={{ paddingTop: 14 }}>
        <h2>Your <em>week</em></h2>
        <p>Free days for the window. They ride along with anything you tap in on; others see counts per day, never who.</p>
      </div>
      <Sect lab="Free" plain={stripLabel(board, today)} />
      <DayStrip days={windowDaysOf(board, today)} selected={free} today={today} boardId={board.id} />
      <p className="hint pad" style={{ margin: "10px 0 16px" }}>Tap a day to toggle.</p>
      <div className="group"><ShowNameSwitch show={me.show_name} /></div>
      <Sect lab="You're in" n={mine.length} />
      {!mine.length ? <div className="empty">Nothing yet. Tap in on the Board.</div> : null}
      {mine.map((c) => (
        <Link key={c.id} href={`/p/${c.id}`} className={`card${c.state === "on" ? " on" : ""}`}>
          <DateBlock d={c.date} />
          <div className="t">
            <div className="titlerow"><Plate icon={c.icon} /><div className="title">{c.title}</div></div>
            <div className="facts">
              {c.state === "on" ? (
                <><Chip kind="on" /><span>{[c.onDay && shortLabel(c.onDay), c.time].filter(Boolean).join(" · ")}</span></>
              ) : c.needsDay ? (
                <span>Your days: {dayNames(c.myDays).join(" · ") || "none yet"}</span>
              ) : (
                <span>No day needed</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}
