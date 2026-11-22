'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { dayNum, dow } from '@/lib/days';
import { hourText, type Slot } from '@/lib/when/slots';
import type { Said } from '../actions';
import { Panel } from '../parts';

const WEEK = 7;
const dayLabel = (day: string) => `${dow(day)} ${dayNum(day)}`;

/** The days across and hours down that the slots cover, a week to a block. An hour a day does not have (the clocks changed) is a gap. */
function layout(slots: Slot[]) {
  const days = [...new Set(slots.map(slot => slot.day))], hours = [...new Set(slots.map(slot => slot.hour))].sort((a, b) => a - b);
  const at = new Map(slots.map(slot => [`${slot.day} ${slot.hour}`, slot.at]));
  const weeks = Array.from({ length: Math.ceil(days.length / WEEK) }, (_, week) => days.slice(week * WEEK, (week + 1) * WEEK));
  return { weeks, hours, at };
}
const Heads = ({ days }: { days: string[] }) => <><span />{days.map(day => <span key={day} className="wn-d">{dow(day)}<b>{dayNum(day)}</b></span>)}</>;

/** When people are free so far, to look at: for a visitor who has not signed in. */
export function Shade({ slots, counts, won = null }: { slots: Slot[]; counts: Record<string, number>; won?: string | null }) {
  const { weeks, hours, at } = layout(slots);
  return <>{weeks.map(days => <div key={days[0]} className="wn-grid" style={{ '--days': days.length } as React.CSSProperties}>
    <Heads days={days} />
    {hours.map(hour => [<span key={hour} className="wn-h">{hourText(hour)}</span>, ...days.map(day => {
      const slot = at.get(`${day} ${hour}`), n = slot ? counts[slot] ?? 0 : 0;
      return slot ? <span key={day} className={`wn-cell${slot === won ? ' won' : ''}`} data-n={Math.min(n, 5)} style={{ '--n': Math.min(n, 5) } as React.CSSProperties} aria-label={`${dayLabel(day)}, ${hourText(hour)}: ${n} free`}>{n}</span> : <span key={day} className="wn-none" />;
    })])}
  </div>)}</>;
}

/**
 * The grid a person paints their times on. Press and drag to paint, starting on a painted time to rub out; the arrow
 * keys move and Space paints. Each time shows how many can make it, the person included. Nothing is kept until Save.
 */
export function Grid({ slots, others, mine, draft = false, onSave, tab = 'Paint the times you can make', after, children }: {
  slots: Slot[]; /** How many other people can make each time. */ others: Record<string, number>; mine: string[]; /** The times are carried over from an earlier poll and not yet this one's: shown painted, kept only on Save. */ draft?: boolean;
  onSave: (slots: string[]) => Promise<Said>; tab?: string; /** The line under the action once nothing is unsaved. */ after: string; /** Pills for the key, after the two that are always there. */ children?: ReactNode;
}) {
  const { weeks, hours, at } = layout(slots);
  const [picked, setPicked] = useState(() => new Set(mine)), [saved, setSaved] = useState(() => new Set(draft ? [] : mine)), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const painting = useRef<boolean | null>(null), box = useRef<HTMLDivElement>(null);
  useEffect(() => { const stop = () => { painting.current = null; }; window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); }; }, []);
  const paint = (slot: string, on: boolean) => setPicked(now => { if (now.has(slot) === on) return now; const next = new Set(now); if (on) next.add(slot); else next.delete(slot); return next; });
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
    const { r, c, w } = event.currentTarget.dataset;
    for (let row = Number(r) + step[0], col = Number(c) + step[1]; row >= 0 && row < hours.length && col >= 0 && col < WEEK; row += step[0], col += step[1]) {
      const next = box.current?.querySelector<HTMLButtonElement>(`[data-w="${w}"][data-r="${row}"][data-c="${col}"]`);
      if (next) { next.focus(); return; }
    }
  };
  const changed = picked.size !== saved.size || [...picked].some(slot => !saved.has(slot));
  const save = async () => {
    setBusy(true); setError('');
    const kept = [...picked], result = await onSave(kept).catch(() => ({ error: 'That did not save. Try again.' }));
    setBusy(false);
    if (result?.error) setError(result.error); else setSaved(new Set(kept));
  };
  const first = slots.find(slot => picked.has(slot.at))?.at ?? slots[0]?.at;
  return <>
    <Panel tab={tab}><div ref={box}>{weeks.map((days, week) => <div key={days[0]} className="wn-grid" role="group" aria-label="Times you can make" style={{ '--days': days.length } as React.CSSProperties}>
      <Heads days={days} />
      {hours.map((hour, row) => [<span key={hour} className="wn-h">{hourText(hour)}</span>, ...days.map((day, col) => {
        const slot = at.get(`${day} ${hour}`);
        if (!slot) return <span key={day} className="wn-none" />;
        const on = picked.has(slot), n = (others[slot] ?? 0) + (on ? 1 : 0);
        return <button key={day} type="button" className="wn-cell" data-w={week} data-r={row} data-c={col} data-n={Math.min(n, 5)} style={{ '--n': Math.min(n, 5) } as React.CSSProperties}
          aria-pressed={on} aria-label={`${dayLabel(day)}, ${hourText(hour)}`} tabIndex={slot === first ? 0 : -1}
          onPointerDown={down(slot)} onPointerEnter={() => { if (painting.current !== null) paint(slot, painting.current); }} onKeyDown={keys}
          // A press already painted on the way down. A click that no pointer made is the keyboard's.
          onClick={event => { if (event.detail === 0) paint(slot, !on); }}>{n}</button>;
      })])}
    </div>)}</div>
    <div className="wn-key"><span className="cs-pill"><i className="t1" /><i className="t3" /><i className="t5" />More people free</span><span className="cs-pill"><i className="mine" />Your times</span>{children}</div></Panel>
    {error && <p className="wn-note bad" role="alert">{error}</p>}
    <button className="cs-btn go wn-big" type="button" disabled={busy} onClick={save}>{busy ? 'Saving' : 'Save my times'}</button>
    <p className="wn-note" role="status">{changed ? 'Not saved yet.' : after}</p>
  </>;
}
