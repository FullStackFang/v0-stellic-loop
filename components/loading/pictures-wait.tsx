'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SeatsTicket, useShown } from './seats';

// A grid of pictures is shown whole or not at all: while any picture in it is still on its way, the ticket stands in its
// place (openspec loop-loading-seats). Made animals are read from the database one by one, so some arrive well after others.

/** The longest the grid is held back: past it, what has arrived is shown and the rest fills in. */
const LIMIT_MS = 10_000;
/** A picture that failed is asked for once more, at an address the browser has not cached the failure of. */
const again = (src: string) => `${src}${src.includes('?') ? '&' : '?'}again=1`;

/** Whether every picture in the box has loaded, read once, when the box first appears: a filter or search after that never hides it again. */
function useAllLoaded(box: React.RefObject<HTMLElement | null>): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const pictures = [...(box.current?.querySelectorAll('img') ?? [])];
    const broken = (img: HTMLImageElement) => img.complete && img.naturalWidth === 0;
    const tried = new Set<HTMLImageElement>();
    const retry = (img: HTMLImageElement) => { tried.add(img); img.src = again(img.src); };
    const waiting = new Set(pictures.filter(img => !img.complete || broken(img)));
    const settle = (img: HTMLImageElement) => { waiting.delete(img); if (!waiting.size) setReady(true); };
    const loaded = (event: Event) => settle(event.currentTarget as HTMLImageElement);
    const failed = (event: Event) => { const img = event.currentTarget as HTMLImageElement; if (tried.has(img)) settle(img); else retry(img); };
    for (const img of waiting) { img.addEventListener('load', loaded); img.addEventListener('error', failed); if (broken(img)) retry(img); }
    if (!waiting.size) { setReady(true); return; }
    const cap = setTimeout(() => setReady(true), LIMIT_MS);
    return () => { clearTimeout(cap); for (const img of pictures) { img.removeEventListener('load', loaded); img.removeEventListener('error', failed); } };
  }, [box]);
  return ready;
}

/**
 * A grid of pictures behind the ticket until all of them have loaded. The grid is in its place from the start, unseen
 * (seats.css), so its pictures load while the ticket stands over it and nothing moves when it appears. Pictures the
 * browser already has show at once, with no ticket.
 */
export function PicturesWait({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null), ready = useAllLoaded(box), ticket = useShown(!ready);
  return <div className="seats-pics" aria-busy={!ready || undefined}>
    {!ready && ticket && <div className="seats-pics-tk"><SeatsTicket quiet /></div>}
    <div ref={box} className={className} role="group" aria-label={label}>{children}</div>
  </div>;
}
