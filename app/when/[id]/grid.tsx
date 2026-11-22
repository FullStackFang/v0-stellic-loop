'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { dayNum, dow, mon } from '@/lib/days';
import { hourText, type Slot } from '@/lib/when/slots';
import type { Said } from '../actions';
import { Panel, Stack, Ticket, Tile, type Shown } from '../parts';

/** One of the times most people can make, as the list beside the grid shows it on a laptop. */
export type Best = { at: string; dow: string; date: string; time: string; line: string; people: Shown[] };

const WIDE = '(min-width: 900px)';
/** How many days fit side by side: five on a phone, seven where there is room. The server draws five. */
function usePer(): number {
  return useSyncExternalStore(
    change => { const query = window.matchMedia?.(WIDE); query?.addEventListener('change', change); return () => query?.removeEventListener('change', change); },
    () => window.matchMedia?.(WIDE).matches ? 7 : 5, () => 5);
}
const dayLabel = (day: string) => `${dow(day)} ${dayNum(day)}`;
const span = (days: string[]) => { const a = days[0], b = days[days.length - 1]; return a === b ? `${dayLabel(a)} ${mon(a)}` : mon(a) === mon(b) ? `${dayNum(a)} to ${dayNum(b)} ${mon(b)}` : `${dayNum(a)} ${mon(a)} to ${dayNum(b)} ${mon(b)}`; };
const Arrow = ({ d }: { d: string }) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

/**
 * The grid of a poll, under its ticket (public/demo/mockups-when-fit.html, 3). A few days show at a time, the first
 * ones first; each set's pill says its best count, and the three best times of all carry a 1, 2 or 3. The stub of the
 * ticket says who can make one time: the best so far, then whichever time was last touched.
 *
 * With `onSave` a person paints their times: press and drag to paint, starting on a painted time to rub out; the arrow
 * keys move and Space paints. Each time shows how many can make it, the person included, and nothing is kept until
 * Save. Without `onSave` it is only to look at, and `action` stands where Save would.
 */
export function Grid({ slots, free, me = null, mine = [], draft = false, onSave, tab, after = '', children, tile, title, best = [], action, tail, won = null, size }: {
  slots: Slot[]; /** Who else can make each time. */ free: Record<string, Shown[]>; /** The person painting. */ me?: Shown | null; mine?: string[];
  /** The times are carried over from an earlier poll and not yet this one's: shown painted, kept only on Save. */ draft?: boolean;
  onSave?: (slots: string[]) => Promise<Said>; tab?: string; /** The line under the action once nothing is unsaved. */ after?: string; /** Pills for the key, after the ones that are always there. */ children?: ReactNode;
  /** The ticket's tile and what is written on it. */ tile?: ReactNode; title?: ReactNode; best?: Best[]; /** In place of Save, for someone who cannot paint. */ action?: ReactNode; /** After the action. */ tail?: ReactNode;
  /** The time that was set. */ won?: string | null; /** The size of the group. */ size: number;
}) {
  const per = usePer(), days = [...new Set(slots.map(slot => slot.day))], hours = [...new Set(slots.map(slot => slot.hour))].sort((a, b) => a - b);
  const at = new Map(slots.map(slot => [`${slot.day} ${slot.hour}`, slot.at])), slotOf = new Map(slots.map(slot => [slot.at, slot]));
  const pages = Array.from({ length: Math.max(1, Math.ceil(days.length / per)) }, (_, page) => days.slice(page * per, (page + 1) * per));
  const [picked, setPicked] = useState(() => new Set(mine)), [saved, setSaved] = useState(() => new Set(draft ? [] : mine)), [kept, setKept] = useState(mine.length > 0 && !draft);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [touched, setTouched] = useState<string | null>(null);
  const [turned, setTurned] = useState(0), page = Math.min(turned, pages.length - 1), shown = pages[page];
  const painting = useRef<boolean | null>(null), box = useRef<HTMLDivElement>(null);
  useEffect(() => { const stop = () => { painting.current = null; }; window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); }; }, []);
  const count = (slot: string) => (free[slot]?.length ?? 0) + (picked.has(slot) ? 1 : 0);
  // The three times most people can make, the most first and among equals the earliest.
  const top = slots.filter(slot => count(slot.at) > 0).sort((a, b) => count(b.at) - count(a.at) || (a.at < b.at ? -1 : 1)).slice(0, 3), rank = new Map(top.map((slot, n) => [slot.at, n + 1]));
  const most = (set: string[]) => Math.max(0, ...slots.filter(slot => set.includes(slot.day)).map(slot => count(slot.at)));
  const paint = (slot: string, on: boolean) => { setTouched(slot); setPicked(now => { if (now.has(slot) === on) return now; const next = new Set(now); if (on) next.add(slot); else next.delete(slot); return next; }); };
  const down = (slot: string) => (event: PointerEvent<HTMLButtonElement>) => {
    // A finger holds on to the cell it first touched: let go, so the cells it then crosses hear it too.
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    painting.current = !picked.has(slot);
    paint(slot, painting.current);
  };
  const keys = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = ({ ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] } as Record<string, [number, number]>)[event.key];
    if (!step) return;
    event.preventDefault();
    const { r, c } = event.currentTarget.dataset;
    for (let row = Number(r) + step[0], col = Number(c) + step[1]; row >= 0 && row < hours.length && col >= 0 && col < per; row += step[0], col += step[1]) {
      const next = box.current?.querySelector<HTMLButtonElement>(`[data-r="${row}"][data-c="${col}"]`);
      if (next) { next.focus(); return; }
    }
  };
  const changed = picked.size !== saved.size || [...picked].some(slot => !saved.has(slot));
  const save = async () => {
    if (!onSave) return;
    setBusy(true); setError('');
    const now = [...picked], result = await onSave(now).catch(() => ({ error: 'That did not save. Try again.' }));
    setBusy(false);
    if (result?.error) setError(result.error); else { setSaved(new Set(now)); setKept(true); }
  };
  const here = slots.filter(slot => shown.includes(slot.day)), first = here.find(slot => picked.has(slot.at))?.at ?? here[0]?.at;
  const pad = Array.from({ length: per - shown.length }, (_, n) => <span key={`pad${n}`} />);
  const ranks = (set: string[]) => { const inSet = top.filter(slot => set.includes(slot.day)); return inSet.length > 0 && <span className="wn-rks" aria-hidden="true">{inSet.map(slot => <i key={slot.at} className="wn-rk">{rank.get(slot.at)}</i>)}</span>; };
  const pager = pages.length < 2 ? null : pages.length <= 3
    ? <div className="wn-modes wn-sets" style={{ '--n': pages.length } as React.CSSProperties}>{pages.map((set, n) => <button key={set[0]} type="button" aria-pressed={n === page} onClick={() => setTurned(n)}><small>Best is {most(set)} of {size}</small><b>{span(set)}</b>{ranks(set)}</button>)}</div>
    : <div className="wn-cal-head wn-sets">
      <button type="button" className="wn-cal-nav" aria-label="Earlier days" disabled={page === 0} onClick={() => setTurned(page - 1)}><Arrow d="M10 3 5 8l5 5" /></button>
      <span className="wn-cal-month" aria-live="polite">{span(shown)} · best is {most(shown)} of {size}</span>
      <button type="button" className="wn-cal-nav" aria-label="Later days" disabled={page === pages.length - 1} onClick={() => setTurned(page + 1)}><Arrow d="M6 3l5 5-5 5" /></button>
    </div>;
  // The stub: who can make the time last touched, or the best one so far.
  const told = slotOf.get(touched ?? top[0]?.at ?? ''), can = told ? [...(me && picked.has(told.at) ? [me] : []), ...(free[told.at] ?? [])] : [], n = told ? count(told.at) : 0;
  const stub = <span className="wn-rd" key={told?.at ?? 'none'} aria-live="polite">
    <span className={`cs-pill ${touched ? 'yes' : 'hot'}`}>{touched ? 'This time' : 'Best so far'}</span>
    {told ? <span><b>{dayLabel(told.day)} {mon(told.day)}, {hourText(told.hour)}</b><small>{n ? `${n} of ${size} can make it${picked.has(told.at) ? ', you too' : ''}` : 'Nobody yet'}</small></span>
      : <span><b>No times yet</b><small>{onSave ? 'Paint the ones you can make' : 'Nobody has answered'}</small></span>}
    <Stack people={can} />
  </span>;
  return <>
    <div className="wn-col"><Panel tab={tab ?? (onSave ? 'Paint the times you can make' : 'When people are free so far')}>{pager}
      <div ref={box} className="wn-grid" role="group" aria-label={onSave ? 'Times you can make' : 'When people are free'} style={{ '--days': per } as React.CSSProperties}>
        <span />{shown.map(day => <span key={day} className="wn-d">{dow(day)}<b>{dayNum(day)}</b></span>)}{pad}
        {hours.map((hour, row) => [<span key={hour} className="wn-h">{hourText(hour)}</span>, ...shown.map((day, col) => {
          const slot = at.get(`${day} ${hour}`);
          if (!slot) return <span key={day} className="wn-none" />;
          const on = picked.has(slot), total = count(slot), badge = rank.has(slot) && <i className="wn-rk" aria-hidden="true">{rank.get(slot)}</i>;
          const look = { className: `wn-cell${slot === won ? ' won' : ''}${slot === touched ? ' sel' : ''}`, 'data-n': Math.min(total, 5), style: { '--n': Math.min(total, 5) } as React.CSSProperties };
          if (!onSave) return <button key={day} type="button" {...look} aria-label={`${dayLabel(day)}, ${hourText(hour)}: ${total} free`} onClick={() => setTouched(slot)}>{total}{badge}</button>;
          return <button key={day} type="button" {...look} data-r={row} data-c={col}
            aria-pressed={on} aria-label={`${dayLabel(day)}, ${hourText(hour)}`} tabIndex={slot === first ? 0 : -1}
            onPointerDown={down(slot)} onPointerEnter={() => { if (painting.current !== null) paint(slot, painting.current); }} onKeyDown={keys} onFocus={() => setTouched(slot)}
            // A press already painted on the way down. A click that no pointer made is the keyboard's.
            onClick={event => { if (event.detail === 0) paint(slot, !on); }}>{total}{badge}</button>;
        }), ...pad.map((_, n) => <span key={`pad${hour}${n}`} />)])}
      </div>
      <div className="wn-key"><span className="cs-pill"><i className="t1" /><i className="t3" /><i className="t5" />More people free</span>{onSave && <span className="cs-pill"><i className="mine" />Yours</span>}{children}</div></Panel></div>
    <div className="wn-col side"><Ticket tile={tile} stub={stub}>{title}</Ticket>
      {best.length > 0 && <div className="wn-best"><Panel tab="Best so far, all days"><div className="wn-picks">{best.map(each => <button key={each.at} type="button" aria-label={`Show ${each.dow} ${each.date}, ${each.time}`}
        onClick={() => { setTurned(Math.max(0, pages.findIndex(set => set.includes(slotOf.get(each.at)?.day ?? '')))); setTouched(each.at); }}>
        <Tile top={each.dow} big={each.date} /><span><b>{each.time}</b><small>{each.line}</small></span><Stack people={each.people} /></button>)}</div></Panel></div>}
      {onSave ? <div className="wn-save">
        {error && <p className="wn-note bad" role="alert">{error}</p>}
        <button className="cs-btn go wn-big" type="button" disabled={busy} onClick={save}>{busy ? 'Saving' : changed || !kept ? 'Save my times' : 'Saved'}</button>
        <p className="wn-note" role="status">{changed ? 'Not saved yet.' : after}</p>
      </div> : action}
      {tail}</div>
  </>;
}
