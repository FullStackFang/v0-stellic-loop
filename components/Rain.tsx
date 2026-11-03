"use client";
import { useEffect, useRef } from "react";
export function Rain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!, context = canvas.getContext("2d");
    if (!context) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const drops = Array.from({ length: 90 }, () => ({ x: Math.random() * 390, y: Math.random() * 844, speed: 4 + Math.random() * 4 }));
    const draw = () => {
      context.clearRect(0, 0, 390, 844);
      context.strokeStyle = getComputedStyle(canvas).color; context.lineWidth = 1.5;
      for (const d of drops) { context.globalAlpha = d.y < 220 ? .45 : .08; context.beginPath(); context.moveTo(d.x, d.y); context.lineTo(d.x - 3, d.y + 14); context.stroke(); d.y += d.speed; if (d.y > 844) d.y = -20; }
      frame = requestAnimationFrame(draw);
    };
    const change = () => { cancelAnimationFrame(frame); context.clearRect(0, 0, 390, 844); if (!motion.matches) draw(); };
    change(); motion.addEventListener("change", change);
    return () => { cancelAnimationFrame(frame); motion.removeEventListener("change", change); };
  }, []);
  return <canvas ref={ref} className="rain" width="390" height="844" />;
}
