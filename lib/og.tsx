// Link-preview images in the v5 palette. Never a person's name.
import { ImageResponse } from "next/og";
import { DELTA, DEFAULT_ICON, ICONS, isIcon } from "./icons";

export const OG_SIZE = { width: 1200, height: 630 };
const PAPER = "#f9f4ec", INK = "#1f1a17", INK2 = "#6a5e56", INK3 = "#98897e", MOSS = "#2f6e4a", CARN = "#8a1414";

export type ProposalOg = { title: string; icon: string; big: string; line: string; board: string; on: boolean };

export function proposalImage(o: ProposalOg, init?: ResponseInit) {
  const k = isIcon(o.icon) ? o.icon : DEFAULT_ICON;
  const [plate, glyph, shade] = DELTA[k];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, color: INK, fontFamily: "serif" }}>
        <div style={{ width: 360, background: o.on ? MOSS : shade, display: "flex", flexDirection: "column", justifyContent: "center", padding: 48, color: "#fffdf8" }}>
          <div style={{ width: 120, height: 120, borderRadius: 28, background: plate, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="72" height="72" viewBox="0 0 256 256" fill={glyph}><path d={ICONS[k]} /></svg>
          </div>
          <div style={{ fontSize: 64, marginTop: 36, lineHeight: 1.05, display: "flex" }}>{o.big}</div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "56px 64px" }}>
          <div style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase", color: INK3, fontFamily: "sans-serif", display: "flex" }}>{o.board}</div>
          <div style={{ fontSize: 72, lineHeight: 1.08, marginTop: 18, display: "flex" }}>{o.title}</div>
          <div style={{ fontSize: 36, marginTop: 28, color: o.on ? MOSS : CARN, fontFamily: "sans-serif", display: "flex" }}>{o.line}</div>
          <div style={{ fontSize: 26, marginTop: 18, color: INK2, fontFamily: "sans-serif", display: "flex" }}>Tap to say you&apos;re in</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, ...init },
  );
}

export function boardImage(name: string) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 96, color: INK, fontFamily: "serif", background: "linear-gradient(168deg, #f6f2fb 0%, #e9e2f4 55%, #d9cfe9 100%)" }}>
        <div style={{ fontSize: 28, letterSpacing: 6, textTransform: "uppercase", color: "#5a3a73", fontFamily: "sans-serif", display: "flex" }}>Quorum</div>
        <div style={{ fontSize: 110, lineHeight: 1.05, marginTop: 24, display: "flex" }}>{name}</div>
        <div style={{ fontSize: 40, marginTop: 28, color: "#6c5a7d", display: "flex" }}>What we could do</div>
      </div>
    ),
    OG_SIZE,
  );
}
