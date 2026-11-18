'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const chevron = <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" /></svg>;

/**
 * The row of days on the team's first tab. The stylesheet shows whole days only and snaps the row to a day; this adds
 * the two arrows that step one day, each hidden at its end of the row. Without script the row still scrolls and snaps.
 */
export function DaysRow({ children }: { children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null), [ends, setEnds] = useState({ left: true, right: true });
  useEffect(() => {
    const el = row.current!;
    const read = () => setEnds({ left: el.scrollLeft < 8, right: el.scrollLeft > el.scrollWidth - el.clientWidth - 8 });
    read(); el.addEventListener('scroll', read, { passive: true }); addEventListener('resize', read);
    return () => { el.removeEventListener('scroll', read); removeEventListener('resize', read); };
  }, []);
  const step = (by: number) => { const el = row.current!, day = el.firstElementChild?.getBoundingClientRect().width ?? 0; el.scrollBy({ left: (day + 18) * by }); };
  return <div className="gt-dayswrap">
    <button type="button" className="gt-step l" aria-label="Earlier days" hidden={ends.left} onClick={() => step(-1)}>{chevron}</button>
    <button type="button" className="gt-step r" aria-label="Later days" hidden={ends.right} onClick={() => step(1)}>{chevron}</button>
    <div className="gt-days" ref={row}>{children}</div>
  </div>;
}
