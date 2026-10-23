import Link from "next/link";
import { Arrow } from "./atoms";
import { Field } from "./Field";

/** The v5 board hero: live label counts, the title, two actions, the drawn field behind. */
export function Hero({ slug, label, open, on }: { slug: string; label: string; open: number; on: number }) {
  return (
    <div className="mast">
      <div className="hero">
        <Field />
        <p className="k">
          <i />§ 01 · {label}
          <small>· {open} open · {on} on</small>
        </p>
        <h2>What we <em>could</em> do</h2>
        <p>Tap in and your free days ride along; when enough of us overlap, Quorum asks.</p>
        <div className="pills">
          <Link className="pill" href={`/b/${slug}/new`}>Post an intent <Arrow /></Link>
          <Link className="pill quiet" href={`/b/${slug}/you`}>Your week</Link>
        </div>
      </div>
    </div>
  );
}
