import { windowLabel } from "@/lib/days";
import type { Board } from "@/lib/types";
import type { CardModel } from "@/lib/view";
import { Sect } from "./atoms";
import { Card } from "./Card";
import { CopyLink } from "./CopyLink";
import { Hero } from "./Hero";

/** The board: hero, then Open (nearest the ask first), On, Past. A new board shows only the hero and its link. */
export function BoardView({ board, open, on, past, signedIn }: { board: Board; open: CardModel[]; on: CardModel[]; past: CardModel[]; signedIn: boolean }) {
  return (
    <>
      <Hero slug={board.slug} label={windowLabel(board)} open={open.length} on={on.length} />
      {!open.length && !on.length && !past.length ? (
        <>
          <div className="empty">Nothing posted yet. Post the first thing you could do.</div>
          <div className="acts"><CopyLink slug={board.slug} /></div>
        </>
      ) : <Sect lab="Open" n={open.length} />}
      {open.map((c) => <Card key={c.id} c={c} signedIn={signedIn} />)}
      {!open.length && (on.length || past.length) ? <div className="empty">Nothing open. Post something.</div> : null}
      {on.length ? (
        <>
          <Sect lab="On" n={on.length} plain="locked · add to calendar" />
          {on.map((c) => <Card key={c.id} c={c} signedIn={signedIn} />)}
        </>
      ) : null}
      {past.length ? (
        <>
          <Sect lab="Past" n={past.length} />
          {past.map((c) => <Card key={c.id} c={c} signedIn={signedIn} />)}
        </>
      ) : null}
    </>
  );
}
