// Marks shared by every page on the Loop system (app/loop.css). See DESIGN.md, "The mark".

/** The arrow that ends a pill button. */
export const Arrow = () => <svg viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" /></svg>;

// The Loop mark: three woven rings, the top one lime (you, linked to the other two).
// Each ring passes over one neighbour and under the other (top over left, left over right, right over top).
// A gap where a ring passes beneath is painted in --lp-ring-bg, so each place the mark sits sets that colour.
const RING_CENTRES = [[50, 35], [35.5, 60], [64.5, 60]] as const, RING_R = 21;
const round = (n: number) => Math.round(n * 100) / 100;
const ringPath = (i: number) => { const [x, y] = RING_CENTRES[i]; return `M${x - RING_R} ${y}a${RING_R} ${RING_R} 0 1 0 ${2 * RING_R} 0a${RING_R} ${RING_R} 0 1 0 ${-2 * RING_R} 0`; };
function crossings(a: number, b: number) {
  const [x1, y1] = RING_CENTRES[a], [x2, y2] = RING_CENTRES[b], dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy), h = Math.sqrt(RING_R ** 2 - d * d / 4);
  return [[x1 + dx / 2 - dy / d * h, y1 + dy / 2 + dx / d * h], [x1 + dx / 2 + dy / d * h, y1 + dy / 2 - dx / d * h]];
}
function arcOf(i: number, [px, py]: number[], degrees: number) {
  const [cx, cy] = RING_CENTRES[i], at = Math.atan2(py - cy, px - cx), spread = degrees * Math.PI / 180;
  const point = (angle: number) => `${round(cx + RING_R * Math.cos(angle))} ${round(cy + RING_R * Math.sin(angle))}`;
  return `M${point(at - spread)}A${RING_R} ${RING_R} 0 0 1 ${point(at + spread)}`;
}
const OVERS = ([[0, 1], [1, 2], [2, 0]] as const).flatMap(([over, under]) => crossings(over, under).map(point => ({ ring: over, gap: arcOf(over, point, 26), arc: arcOf(over, point, 30) })));

/** One stroke: solid, or (with `inline`) Stanford HAI's three parallel lines. */
function RingStroke({ d, width, inline, you }: { d: string; width: number; inline: boolean; you: boolean }) {
  const colour = you ? 'var(--lime, oklch(96.4% 0.19 117))' : 'currentColor';
  return <>
    <path d={d} stroke={colour} strokeWidth={width} />
    {inline && <><path d={d} stroke="var(--lp-ring-bg)" strokeWidth={round(width * .62)} /><path d={d} stroke={colour} strokeWidth={round(width * .2)} /></>}
  </>;
}

/** The Loop mark. Solid for small sizes; `inline` for large ones (48px and up). */
export function Rings({ className, inline = false }: { className?: string; inline?: boolean }) {
  const width = inline ? 8.5 : 9;
  return <svg className={className} viewBox="0 0 100 100" aria-hidden="true" fill="none">
    {[0, 1, 2].map(i => <RingStroke key={i} d={ringPath(i)} width={width} inline={inline} you={i === 0} />)}
    {OVERS.map(({ ring, gap, arc }, i) => <g key={i}><path d={gap} stroke="var(--lp-ring-bg)" strokeWidth={round(width * 1.7)} /><RingStroke d={arc} width={width} inline={inline} you={ring === 0} /></g>)}
  </svg>;
}
