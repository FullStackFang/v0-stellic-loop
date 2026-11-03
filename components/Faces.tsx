import type { PlanFace } from "@/lib/view";
export function Faces({ faces, remaining, ended = false }: { faces: PlanFace[]; remaining: number; ended?: boolean }) {
  const shown = faces.slice(0, 6);
  return <div className={`faces${shown.length > 4 ? " many" : ""}`}>
    {shown.map(f => <div className="p" key={f.id}><span className="face" aria-label={f.name || "Anonymous member"}>{f.initial}</span><span>{f.name || "\u00a0"}</span></div>)}
    {faces.length > 6 ? <span className="overflow">+{faces.length - 6} more</span> : null}
    {remaining > 0 ? Array.from({ length: ended ? Math.min(remaining, 6 - shown.length) : 1 }, (_, i) => <div className="p slot" key={`slot${i}`}><span className="face">+{ended ? 1 : remaining}</span><span>{!ended && remaining === 1 ? "one more" : ""}</span></div>) : null}
  </div>;
}
