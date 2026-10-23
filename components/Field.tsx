"use client";
import { useEffect, useRef } from "react";

// The Dusk field from quorum.html v5: orbit rings in the top-right corner that
// twist against each other, a sparse graphite mesh, grain. Paused off-screen;
// one still frame under reduced motion.
type RGB = [number, number, number];
const INK: RGB = [31, 26, 23], CARN: RGB = [179, 27, 27], GRAPH: RGB = [86, 89, 91], CORAL: RGB = [255, 123, 84];
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function grainLayer(W: number, H: number, dpr: number) {
  const c = document.createElement("canvas");
  c.width = W * dpr;
  c.height = H * dpr;
  const g = c.getContext("2d")!;
  const img = g.createImageData(c.width, c.height);
  const d = img.data;
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
  for (let i = 0; i < d.length; i += 4) {
    const v = rnd() * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 22;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function Field() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const hero = cv?.parentElement;
    if (!cv || !hero) return;
    const W = hero.clientWidth, H = hero.clientHeight;
    if (!W || !H) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = W * dpr;
    cv.height = H * dpr;
    const grain = grainLayer(W, H, dpr);
    let s = 42;
    const rnd = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
    const ox = W + 6, oy = -6, maxR = Math.hypot(W, H) * 0.66;
    const falloff = (x: number, y: number) => 1 - smooth(0.22, 0.95, Math.hypot(x - ox, y - oy) / maxR);
    const rings: { rad: number; dir: number; base: number; dots: { a: number; r: number; c: RGB }[] }[] = [];
    for (let i = 0, rad = 8; rad < maxR; i++, rad += 9) {
      const n = Math.max(6, Math.round((rad * 2 * Math.PI) / 8));
      const ring = { rad, dir: i % 2 ? -1 : 1, base: 0.05 + rnd() * 0.2, dots: [] as { a: number; r: number; c: RGB }[] };
      for (let k = 0; k < n; k++) ring.dots.push({ a: (k / n) * 2 * Math.PI + rnd() * 0.2, r: 0.6 + rnd() * 0.9, c: rnd() < 0.05 ? CARN : INK });
      rings.push(ring);
    }
    const turn = (ring: (typeof rings)[number], i: number, t: number) => ring.dir * 0.5 * Math.sin(0.45 * t - i * 0.42) + 0.12 * ring.dir * ring.base * t;
    const P: { x: number; y: number; vx: number; vy: number; r: number; c: RGB }[] = [];
    const REACH = 60, LA = 0.2, LW = 0.6;
    for (let i = 0; i < 34; i++) P.push({ x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 0.12, vy: (rnd() - 0.5) * 0.12, r: 0.9 + rnd() * 1.1, c: rnd() < 0.12 ? CARN : GRAPH });
    const t0 = performance.now();
    let last = 0, visible = true, raf = 0, alive = true;

    function frame(now: number) {
      if (!alive || !visible) return;
      if (now - last < 33) {
        raf = requestAnimationFrame(frame);
        return;
      }
      last = now;
      const t = (now - t0) / 1000;
      g!.setTransform(dpr, 0, 0, dpr, 0, 0);
      g!.clearRect(0, 0, W, H);
      const rg = g!.createRadialGradient(W * 0.88, H * 0.05, 0, W * 0.88, H * 0.05, W * 0.62);
      rg.addColorStop(0, rgba(CORAL, 0.55));
      rg.addColorStop(0.45, rgba(CORAL, 0.18));
      rg.addColorStop(1, rgba(CORAL, 0));
      g!.fillStyle = rg;
      g!.fillRect(0, 0, W, H);
      rings.forEach((ring, i) => {
        const off = turn(ring, i, t);
        for (const d of ring.dots) {
          const a = d.a + off;
          const x = ox + Math.cos(a) * ring.rad, y = oy + Math.sin(a) * ring.rad;
          if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
          const wt = falloff(x, y);
          if (wt <= 0.02) continue;
          g!.globalAlpha = (d.c === CARN ? 0.9 : 0.42) * wt;
          g!.fillStyle = rgba(d.c, 1);
          g!.beginPath();
          g!.arc(x, y, d.r, 0, Math.PI * 2);
          g!.fill();
        }
      });
      g!.globalAlpha = 1;
      for (const p of P) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }
      const B = 6, buckets: number[][] = Array.from({ length: B }, () => []);
      g!.lineWidth = LW;
      for (let i = 0; i < P.length; i++)
        for (let j = i + 1; j < P.length; j++) {
          const a = P[i], b = P[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          if (Math.abs(dx) > REACH || Math.abs(dy) > REACH) continue;
          const d = Math.hypot(dx, dy);
          if (d < REACH) buckets[Math.min(B - 1, Math.floor((1 - d / REACH) * B))].push(a.x, a.y, b.x, b.y);
        }
      buckets.forEach((q, k) => {
        if (!q.length) return;
        g!.strokeStyle = rgba(GRAPH, ((k + 0.5) / B) * LA);
        g!.beginPath();
        for (let i = 0; i < q.length; i += 4) {
          g!.moveTo(q[i], q[i + 1]);
          g!.lineTo(q[i + 2], q[i + 3]);
        }
        g!.stroke();
      });
      for (const p of P) {
        g!.fillStyle = rgba(p.c, p.c === CARN ? 0.8 : 0.6);
        g!.beginPath();
        g!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g!.fill();
      }
      g!.globalAlpha = 0.9;
      g!.setTransform(1, 0, 0, 1, 0, 0);
      g!.drawImage(grain, 0, 0);
      g!.globalAlpha = 1;
      if (!RM) raf = requestAnimationFrame(frame);
    }

    const io = new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (visible) {
        if (RM) frame(t0 + 1600);
        else raf = requestAnimationFrame(frame);
      }
    });
    io.observe(hero);
    return () => {
      alive = false;
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" />;
}
