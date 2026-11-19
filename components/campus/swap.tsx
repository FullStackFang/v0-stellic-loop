'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/** One campus of a school with more than one, as its ticket says it. `home` is the viewer's own; `here` is the one on the page. */
export type SwapCampus = { slug: string; title: string; line: string; mark: 'tower' | 'tram'; count: number; home: boolean; here: boolean };

const MARK = {
  tower: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 21V9.5L12 3l3.5 6.5V21M6 21h12M8.5 13h7M8.5 17h7" /><circle cx={12} cy={9.8} r={1.3} /></svg>,
  tram: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 5.5 21.5 3M12 4.3V8" /><rect x={5.5} y={8} width={13} height={10.5} rx={2.6} /><path d="M5.5 13.2h13M9.8 8v5.2M14.2 8v5.2" /></svg>,
};

/** Whether the page is showing a campus other than the viewer's own. Nobody's own (signed out, the admin elsewhere) is not visiting. */
export const visiting = (campuses: readonly SwapCampus[]) => campuses.some(each => each.home) && !campuses.some(each => each.here && each.home);

/**
 * Looking at another campus of your school (public/demo/mockups-campus-swap.html): a small luggage tag in the corner of
 * the map's head, clear of the map. It names the campus on the page and opens one ticket per campus. Your own campus
 * stays yours; the other one is somewhere you look, and may join things, without moving.
 */
export function Swap({ campuses }: { campuses: SwapCampus[] }) {
  const [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('click', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', key); };
  }, [open]);
  const here = campuses.find(each => each.here), mine = campuses.find(each => each.home);
  if (!here || campuses.length < 2) return null;
  const word = visiting(campuses) ? 'Visiting' : here.home ? 'Your campus' : 'Campus';
  return <div className="cs-swap" ref={box}>
    <button className="cs-tag" aria-expanded={open} aria-label={`${word}: ${here.title}. Swap campus`} onClick={() => setOpen(now => !now)}>
      <span className="cs-tag-face"><i />{MARK[here.mark]}<small>{word}</small><b>{here.title}</b></span>
      <span className="cs-tag-stub">Swap<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.500M6 8l-2.500 2.500L6 13" /></svg></span>
    </button>
    {open && <div className="cs-swap-menu" role="group" aria-label="Campuses">
      <small>Look around another campus.{mine ? ` ${mine.title} stays yours.` : ''}</small>
      {campuses.map(each => {
        const face = <><span className="cs-tk-main"><small>{each.home ? 'Your campus · ' : ''}{each.count} on this week</small><b>{each.title}</b><em>{each.line}</em></span><span className="cs-tk-stub">{MARK[each.mark]}<b>{each.here ? 'Here' : 'Look'}</b></span></>;
        return each.here ? <span key={each.slug} className="cs-tk" aria-current="true">{face}</span> : <Link key={each.slug} className="cs-tk" href={`/c/${each.slug}`}>{face}</Link>;
      })}
    </div>}
  </div>;
}
