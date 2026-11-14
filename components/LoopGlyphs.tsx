import { useId } from 'react';

// Marks shared by every page on the Loop system (app/loop.css). See DESIGN.md, "The mark".

/** The arrow that ends a pill button. */
export const Arrow = () => <svg viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" /></svg>;

// The Loop mark: three woven rings, the top one lime (you, linked to the other two).
// Each ring passes over one neighbour and under the other (top over left, left over right, right over top).
// Where a ring passes beneath, it is masked by a slightly wider copy of the ring above it, so the gap
// follows that ring's edge exactly and touches nothing else. The mark needs no background colour.
const RING_CENTRES = [[50, 35], [35.5, 60], [64.5, 60]] as const, RING_R = 21;
const round = (n: number) => Math.round(n * 100) / 100;
const ringPath = (i: number, r = RING_R) => { const [x, y] = RING_CENTRES[i]; return `M${round(x - r)} ${y}a${r} ${r} 0 1 0 ${round(2 * r)} 0a${r} ${r} 0 1 0 ${round(-2 * r)} 0`; };
/** The ring that passes over ring `i`. */
const over = (i: number) => (i + 2) % 3;

/** One ring: a solid band, or (with `inline`) Stanford HAI's three parallel lines, each its own stroke. */
function Ring({ i, width, inline }: { i: number; width: number; inline: boolean }) {
  const colour = i === 0 ? 'var(--lime, oklch(96.4% 0.19 117))' : 'currentColor';
  if (!inline) return <path d={ringPath(i)} stroke={colour} strokeWidth={width} />;
  const line = round(width * .19), off = round((width - line) / 2);
  return <>{[-off, 0, off].map(d => <path key={d} d={ringPath(i, round(RING_R + d))} stroke={colour} strokeWidth={line} />)}</>;
}

/**
 * The Loop mark. Solid for small sizes; `inline` for large ones (48px and up).
 * `tight` narrows the gap at each crossing to the spacing of the inline lines, for very large sizes.
 */
export function Rings({ className, inline = false, tight = false }: { className?: string; inline?: boolean; tight?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, ''), width = inline ? 8.5 : 9, gap = round(width * (tight ? 1.42 : 1.7));
  return <svg className={className} viewBox="0 0 100 100" aria-hidden="true" fill="none">
    <defs>{[0, 1, 2].map(i => <mask key={i} id={`${id}m${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <rect width="100" height="100" fill="white" /><path d={ringPath(over(i))} stroke="black" strokeWidth={gap} />
    </mask>)}</defs>
    {[0, 1, 2].map(i => <g key={i} mask={`url(#${id}m${i})`}><Ring i={i} width={width} inline={inline} /></g>)}
  </svg>;
}
