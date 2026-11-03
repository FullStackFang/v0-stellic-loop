import type { CSSProperties } from "react";
import { solar, type Sky } from "./solar";
export function solarStyle(hour: number, sky: Sky, ended = false): CSSProperties {
  const o = solar(hour, sky);
  return { "--tint": ended ? "#dcd7cc" : o.tint, "--fg": ended ? "#1a1612" : o.fg,
    "--sx": ended ? "0px" : `${o.sx.toFixed(1)}px`, "--sy": ended ? "0px" : `${o.sy.toFixed(1)}px`, "--shade": ended ? "transparent" : o.shade,
    "--sunx": `${o.sun.x / 390 * 100}%`, "--suny": `${o.sun.y}px`, "--sunvis": o.sun.vis,
    "--moonx": `${o.moon.x / 390 * 100}%`, "--moony": `${o.moon.y}px`, "--moonvis": o.moon.vis,
    "--lx": `${o.light.x / 390 * 100}%`, "--ly": `${o.light.y}px`, "--night": o.deep } as CSSProperties;
}
