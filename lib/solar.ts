/** Pure lighting model shared by server-rendered pages and share images.
 * Ported from the approved public/demo/mockups-sun.html wheel. */
export type Sky = "clear" | "cloudy" | "rain";
export const STOPS: [number, string][] = [[5,"#4b3461"],[5.5,"#b0646a"],[6,"#ffb15c"],[9,"#ffcd3a"],[13,"#ffe14a"],[16,"#ffcf3a"],[18,"#ff8a66"],[18.75,"#8c4663"],[19.5,"#2d2b4e"],[21,"#1b1e38"],[24,"#141730"],[27,"#121528"],[28.5,"#1e2142"],[29,"#4b3461"]];
const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a: number[], b: number[], t: number) => "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
const lum = (h: string) => {
  const [r, g, b] = hex(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
  return .2126 * r + .7152 * g + .0722 * b;
};
function tintAt(t: number) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i], [t1, c1] = STOPS[i + 1];
    if (t <= t1) return mix(hex(c0), hex(c1), (t - t0) / (t1 - t0));
  }
  return STOPS[STOPS.length - 1][1];
}
export const WHEEL = { cx: 195, cy: 488, rx: 220, ry: 393 };
export function solar(t: number, sky: Sky = "clear") {
  t = ((t % 24) + 24) % 24;
  const tt = t < 5 ? t + 24 : t;
  const th = (t - 12) / 24 * 2 * Math.PI;
  const sun = { s: Math.sin(th), c: Math.cos(th) }, moon = { s: -sun.s, c: -sun.c };
  const night = moon.c > sun.c, lit = night ? moon : sun, e = Math.max(0, lit.c);
  const taper = Math.min(1, e / .35);
  let length = night ? 3 + 3 * (1 - e) : 4 + 8 * (1 - e);
  let alpha = night ? .62 : .5 + .5 * taper;
  const rgb = night ? "8,9,24" : "26,22,18";
  if (sky === "cloudy") { length *= .5; alpha = night ? .45 : .28 + .12 * taper; }
  if (sky === "rain") { length = 2; alpha = night ? .32 : .22; }
  const sx = -lit.s * length, sy = 3 + length * .45, deep = night ? Math.min(1, e * 3) : 0;
  let tint = tintAt(tt);
  if (sky === "cloudy") tint = mix(hex(tint), hex(mix(hex("#d8d1c2"), hex("#2a2d3d"), deep)), .5);
  if (sky === "rain") tint = mix(hex(tint), hex(mix(hex("#9fb0c2"), hex("#273243"), deep)), .72);
  const luminance = lum(tint), paperWins = (1.03 / (luminance + .05)) > ((luminance + .05) / .062);
  const pos = (b: { s: number; c: number }) => ({ x: WHEEL.cx + WHEEL.rx * b.s, y: WHEEL.cy - WHEEL.ry * b.c, vis: Math.max(0, Math.min(1, (b.c + .14) / .14)) });
  return { night, e, deep, tint, sx, sy, shade: `rgba(${rgb},${alpha.toFixed(2)})`, fg: paperWins ? "#fffdf7" : "#1a1612", dark: paperWins, sun: pos(sun), moon: pos(moon), light: pos(lit) };
}
