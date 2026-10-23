// Small v5 pieces with no state: plate, date block, mini heat, chip, glyphs.
import type { CSSProperties } from "react";
import { ICONS, isIcon, DEFAULT_ICON, plateStyle } from "@/lib/icons";
import type { DateBlock as DateModel, HeatView } from "@/lib/view";

export function Glyph({ icon }: { icon: string }) {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d={ICONS[isIcon(icon) ? icon : DEFAULT_ICON]} />
    </svg>
  );
}

export function Plate({ icon, lg }: { icon: string; lg?: boolean }) {
  return (
    <span className={`plate${lg ? " lg" : ""}`} style={plateStyle(icon) as CSSProperties}>
      <Glyph icon={icon} />
    </span>
  );
}

export function DateBlock({ d }: { d: DateModel }) {
  return (
    <div className={`date ${d.cls}`}>
      <small>{d.small}</small>
      <b>{d.big}</b>
      {d.sub ? <i>{d.sub}</i> : d.cls === "none" ? null : <i />}
    </div>
  );
}

export function MiniHeat({ heat, style }: { heat: HeatView; style?: CSSProperties }) {
  return (
    <>
      <div className="mini" style={style} role="img" aria-label={heat.filter((c) => c.count).map((c) => `${c.day}: ${c.count}`).join(", ") || "No days yet"}>
        {heat.map((c) => (
          <div key={c.day} className={[c.on && "on", c.best && "best", c.you && "you"].filter(Boolean).join(" ")}>
            {c.count || ""}
          </div>
        ))}
      </div>
      <div className="minil" aria-hidden="true">
        {heat.map((c) => (
          <div key={c.day} className={c.best ? "best" : ""}>{c.letter}</div>
        ))}
      </div>
    </>
  );
}

export function Chip({ kind, children }: { kind: "ready" | "on" | "open"; children?: React.ReactNode }) {
  const cls = kind === "on" ? "chip green" : kind === "open" ? "chip open" : "chip";
  return <span className={cls}>{children ?? (kind === "on" ? "On" : kind === "ready" ? "Ready" : "Open")}</span>;
}

export function Sect({ lab, n, plain }: { lab: string; n?: number; plain?: string }) {
  return (
    <div className="sect">
      <span className="lab">{lab}</span>
      {plain ? <span className="plain">{plain}</span> : n !== undefined ? <span className="n">{n}</span> : null}
    </div>
  );
}

export const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
);
