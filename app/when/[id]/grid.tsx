'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { dayNum, dow, mon } from '@/lib/days';
import { hourText, spanText, type Slot } from '@/lib/when/slots';
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

/** The event the bar's "Sign in" sends before opening its own card: a poll's guest card answers it and opens instead. */
export const WHO = 'loopd:who';
/** Where what is painted is kept in this tab while someone signs in: one place per poll. */
const keepKey = () => `wn-keep:${location.pathname}`;
// The animals on "Have Loopd?": signing in is what brings yours.
const PETS = ['07', '03', '12'];
/** How long after the last painted time the times save themselves. */
const AUTO_MS = 500;

/**
 * The grid of a poll, under its ticket (public/demo/mockups-when-fit.html, 3). A few days show at a time, the first
 * ones first; each set's pill says its best count, and the three best times of all carry a 1, 2 or 3. The stub of the
 * ticket says who can make one time: the best so far, then whichever time was last touched.
 *
 * With `onSave` a person paints their times: press and drag to paint, starting on a painted time to rub out; the arrow
 * keys move and Space paints. Each time shows how many can make it, the person included, and nothing is kept until
 * Save. A poll whose times are smaller than an hour is one plain table: an hour is as tall as ever and is ruled into
 * its halves or quarters. A press and drag marks a box of time, across days too; one that starts on a person's own
 * time clears. Their time is drawn as blocks that say when they start and end, the days under the stroke light up, and
 * a pill in the key says the exact time. The arrow keys move down a day and Space paints
 * (public/demo/mockups-when-simple.html, B). What is painted saves by itself a moment after the painting stops, once it is known whose times they are. Without `onSave` it is only to look at, and `action` stands where Save would.
 */
export function Grid({ slots, free, me: given = null, mine = [], draft = false, onSave, guest, onEmail, ways, tab, after = '', children, tile, title, best = [], action, tail, won = null, size }: {
  slots: Slot[]; /** Who else can make each time. */ free: Record<string, Shown[]>; /** The person painting. */ me?: Shown | null; mine?: string[];
  /** The times are carried over from an earlier poll and not yet this one's: shown painted, kept only on Save. */ draft?: boolean;
  onSave?: (slots: string[], name?: string) => Promise<Said>;
  /** The person has no account: they save under a name, and may leave an address for the invite. `name` and `email` are what this browser already gave. */
  guest?: { name: string; email: string | null }; onEmail?: (email: string) => Promise<Said>; /** The ways to sign in, for the card that asks a guest who they are. */ ways?: ReactNode; tab?: string; /** The line under the action once nothing is unsaved. */ after?: string; /** Pills for the key, after the ones that are always there. */ children?: ReactNode;
  /** The ticket's tile and what is written on it. */ tile?: ReactNode; title?: ReactNode; best?: Best[]; /** In place of Save, for someone who cannot paint. */ action?: ReactNode; /** After the action. */ tail?: ReactNode;
  /** The time that was set. */ won?: string | null; /** The size of the group. */ size: number;
}) {
  const per = usePer(), days = [...new Set(slots.map(slot => slot.day))], hours = [...new Set(slots.map(slot => slot.hour * 60 + slot.minute))].sort((a, b) => a - b);
  // Rows are times of day, in minutes after midnight. `fine` is a poll with times smaller than an hour; `tall` is how many hours a day has.
  const fine = slots.some(slot => slot.minute > 0), tall = new Set(slots.map(slot => slot.hour)).size, clock = (time: number) => hourText(Math.floor(time / 60), time % 60);
  const at = new Map(slots.map(slot => [`${slot.day} ${slot.hour * 60 + slot.minute}`, slot.at])), slotOf = new Map(slots.map(slot => [slot.at, slot]));
  const pages = Array.from({ length: Math.max(1, Math.ceil(days.length / per)) }, (_, page) => days.slice(page * per, (page + 1) * per));
  const [picked, setPicked] = useState(() => new Set(mine)), [saved, setSaved] = useState(() => new Set(draft ? [] : mine)), [kept, setKept] = useState(mine.length > 0 && !draft);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [touched, setTouched] = useState<string | null>(null);
  const [turned, setTurned] = useState(0), page = Math.min(turned, pages.length - 1), shown = pages[page];
  const painting = useRef<boolean | null>(null), box = useRef<HTMLDivElement>(null), field = useRef<HTMLInputElement>(null);
  // A guest says who they are before painting: the card is open on arrival for someone this browser does not know,
  // and `ready` is whether they have given a name since.
  const [asking, setAsking] = useState(!!onSave && !!guest && !guest.name), [ready, setReady] = useState(!!guest?.name), who = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(guest?.name ?? ''), [email, setEmail] = useState(''), [sentTo, setSentTo] = useState(guest?.email ?? null), [miss, setMiss] = useState(false), [inviting, setInviting] = useState(false);
  // A guest is drawn as the initial of the name they are typing.
  const me = guest && given ? { ...given, name: name.trim() || '?' } : given;
  // `lifted` counts the times the pointer has come up, so what was painted in one stroke is saved when the stroke ends.
  const [lifted, setLifted] = useState(0), [dirty, setDirty] = useState(false), [refused, setRefused] = useState<Set<string> | null>(null);
  useEffect(() => { const stop = () => { painting.current = null; setLifted(n => n + 1); }; window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); }; }, []);
  // A fine poll's strips. A day is `rows` steps of `step` minutes from its first hour; a place on a strip is a row.
  const step = !fine ? 60 : slots.some(slot => slot.minute % 30) ? 15 : 30, perHour = 60 / step, rows = tall * perHour, firstHour = Math.min(...slots.map(slot => slot.hour));
  const timeOf = (row: number) => firstHour * 60 + row * step, slotAt = (day: string, row: number) => at.get(`${day} ${timeOf(row)}`), pct = (n: number) => `${n / rows * 100}%`;
  // The stroke under way: where it began, whether it marks or clears, and what was marked before it. `live` is the box it covers so far: columns of the days shown, and rows.
  const drag = useRef<{ col: number; row: number; on: boolean; base: Set<string> } | null>(null), [live, setLive] = useState<{ on: boolean; c0: number; c1: number; from: number; to: number } | null>(null);
  const count = (slot: string) => (free[slot]?.length ?? 0) + (picked.has(slot) ? 1 : 0);
  // The three times most people can make, the most first and among equals the earliest.
  const top = slots.filter(slot => count(slot.at) > 0).sort((a, b) => count(b.at) - count(a.at) || (a.at < b.at ? -1 : 1)).slice(0, 3), rank = new Map(top.map((slot, n) => [slot.at, n + 1]));
  const most = (set: string[]) => Math.max(0, ...slots.filter(slot => set.includes(slot.day)).map(slot => count(slot.at)));
  const paint = (slot: string, on: boolean) => { if (guest && !ready) { painting.current = null; ask(); return; } setTouched(slot); setDirty(true); setPicked(now => { if (now.has(slot) === on) return now; const next = new Set(now); if (on) next.add(slot); else next.delete(slot); return next; }); };
  const down = (slot: string) => (event: PointerEvent<HTMLButtonElement>) => {
    // A finger holds on to the cell it first touched: let go, so the cells it then crosses hear it too.
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    painting.current = !picked.has(slot);
    paint(slot, painting.current);
  };
  const cellAt = (event: PointerEvent<HTMLDivElement>) => {
    const size = event.currentTarget.getBoundingClientRect(), within = (n: number, max: number) => Math.max(0, Math.min(max, n));
    return size.width && size.height ? { col: within(Math.floor((event.clientX - size.left) / size.width * shown.length), shown.length - 1), row: within(Math.floor((event.clientY - size.top) / size.height * rows), rows - 1) } : { col: 0, row: 0 };
  };
  /** Marks, or clears, the box of time from where the stroke began to `to`, on top of what was there before it. */
  const sweep = (to: { col: number; row: number }) => {
    const now = drag.current;
    if (!now) return;
    const c0 = Math.min(now.col, to.col), c1 = Math.max(now.col, to.col), r0 = Math.min(now.row, to.row), r1 = Math.max(now.row, to.row), next = new Set(now.base);
    for (let col = c0; col <= c1; col++) for (let row = r0; row <= r1; row++) { const slot = slotAt(shown[col], row); if (slot) { if (now.on) next.add(slot); else next.delete(slot); } }
    setPicked(next); setDirty(true); setLive({ on: now.on, c0, c1, from: r0, to: r1 + 1 });
  };
  const press = (event: PointerEvent<HTMLDivElement>) => {
    const here = cellAt(event), slot = slotAt(shown[here.col], here.row);
    if (!slot) return;
    setTouched(slot);
    if (!onSave) return;
    if (guest && !ready) { ask(); return; }
    // The table holds the pointer for the whole stroke, so the stroke ends when the press does, wherever that is.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    painting.current = !picked.has(slot); drag.current = { ...here, on: painting.current, base: new Set(picked) };
    sweep(here);
  };
  const glide = (event: PointerEvent<HTMLDivElement>) => { const here = cellAt(event), slot = slotAt(shown[here.col], here.row); if (slot && (drag.current || event.pointerType === 'mouse')) setTouched(slot); sweep(here); };
  const lift = () => { if (drag.current) { drag.current = null; setLive(null); } };
  const stripKeys = (day: string, col: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    const on = touched ? slotOf.get(touched) : undefined, here = on?.day === day ? (on.hour - firstHour) * perHour + on.minute / step : 0, move = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[event.key];
    if (move) { event.preventDefault(); const slot = slotAt(day, Math.max(0, Math.min(rows - 1, on?.day === day ? here + move : 0))); if (slot) setTouched(slot); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); box.current?.querySelectorAll<HTMLElement>('.wn-trk')[col + (event.key === 'ArrowLeft' ? -1 : 1)]?.focus(); }
    else if (onSave && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); const slot = slotAt(day, here); if (slot) paint(slot, !picked.has(slot)); }
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
  /** Saves the painted times, or `these`. Says whether it did. */
  const save = async (these?: string[]) => {
    if (!onSave) return false;
    if (guest && !name.trim()) { setMiss(true); who.current?.focus(); return false; }
    setBusy(true); setError(''); if (these) setPicked(new Set(these));
    const now = these ?? [...picked], result = await onSave(now, guest ? name.trim() : undefined).catch(() => ({ error: 'That did not save. Try again.' }));
    setBusy(false);
    if (result?.error) { setError(result.error); setRefused(picked); return false; }
    setSaved(new Set(now)); setKept(true); return true;
  };
  // Painting saves itself: half a second after the last change, with no stroke under way. Only what this person
  // painted here (times carried over from another poll wait for a press), and only once it is known whose they are.
  // A save that was refused is not tried again until something changes; Save is there for it.
  const auto = !!onSave && (!guest || ready), saving = auto && changed && dirty && refused !== picked;
  useEffect(() => {
    if (!saving || busy) return;
    const soon = setTimeout(() => { if (painting.current === null) void save_.current(); }, AUTO_MS);
    return () => clearTimeout(soon);
  }, [saving, busy, picked, lifted]);
  // The card that asks a guest who they are (public/demo/mockups-when-one-card-4.html). What is painted is kept in
  // this tab while it is open, so signing in from it, which loads the page again, does not lose it.
  const ask = () => { try { sessionStorage.setItem(keepKey(), JSON.stringify([...picked])); } catch { /* a browser that keeps nothing */ } setMiss(false); setError(''); setAsking(true); };
  const shut = () => { try { sessionStorage.removeItem(keepKey()); } catch { /* nothing kept */ } setAsking(false); };
  /** The name half's button: the name is taken, and what is painted already is saved under it. With nothing painted the card only closes, to paint. */
  const named = async () => {
    if (!name.trim()) { setMiss(true); who.current?.focus(); return; }
    setReady(true);
    if (picked.size === 0 || await save()) shut();
  };
  // The bar's "Sign in" opens this card too on a poll a guest can answer, in place of its own.
  useEffect(() => {
    if (!onSave || !guest) return;
    const open = (event: Event) => { event.preventDefault(); ask(); }, key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') shut(); };
    window.addEventListener(WHO, open); if (asking) window.addEventListener('keydown', key);
    return () => { window.removeEventListener(WHO, open); window.removeEventListener('keydown', key); };
  });
  // Signed in from the card: the times painted before are painted again and saved.
  const save_ = useRef(save); useEffect(() => { save_.current = save; });
  useEffect(() => {
    if (!onSave || guest) return;
    let kept_: string | null = null;
    try { kept_ = sessionStorage.getItem(keepKey()); sessionStorage.removeItem(keepKey()); } catch { return; }
    if (!kept_) return;
    const known = new Set(slots.map(slot => slot.at)), these = (JSON.parse(kept_) as string[]).filter(slot => known.has(slot));
    if (these.length === 0) return;
    void save_.current(these);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const send = async () => {
    if (!onEmail) return;
    const to = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { setMiss(true); field.current?.focus(); return; }
    setBusy(true); setError('');
    const result = await onEmail(to).catch(() => ({ error: 'That did not save. Try again.' }));
    setBusy(false);
    if (result?.error) setError(result.error); else setSentTo(to);
  };
  const enter = (run: () => void) => (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') { event.preventDefault(); run(); } };
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
    {told ? <span><b>{dayLabel(told.day)} {mon(told.day)}, {hourText(told.hour, told.minute)}</b><small>{n ? `${n} of ${size} can make it${picked.has(told.at) ? ', you too' : ''}` : 'Nobody yet'}</small></span>
      : <span><b>No times yet</b><small>{onSave ? 'Paint the ones you can make' : 'Nobody has answered'}</small></span>}
    <Stack people={can} />
  </span>;
  // Once a guest's times are saved, who they are saved as and the offer of the invite: one strip, across the top on a laptop and at the foot on a phone.
  const strip = onSave && guest && kept && (!changed || saving) ? <div className="wn-save wn-who wn-top">
    {error && !asking && <p className="wn-note bad" role="alert">{error}</p>}
    {/* One raised paper capsule (public/demo/mockups-when-saved-row.html, C): who the times are saved as, and the invite on the same line. */}
    <div className={`wn-cap wn-me${miss ? ' miss' : ''}`} role="status">
      <i className="cs-face wn-ini" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</i>
      {inviting && !sentTo && onEmail ? <>
        <input ref={field} autoFocus type="email" aria-label="Email for the invite" value={email} maxLength={254} autoComplete="email" placeholder="you@email.com" onChange={event => { setEmail(event.target.value); setMiss(false); }} onKeyDown={enter(send)} />
        <button className="cs-btn wn-go" type="button" disabled={busy} onClick={send}>{busy ? 'Sending' : 'Send it to me'}</button>
        <button className="cs-btn wn-alt" type="button" onClick={() => { setInviting(false); setMiss(false); }}>Back</button>
      </> : <>
        <span className="wn-who-name"><small>{changed ? 'Saving as ' : 'Saved as '}</small><b>{name.trim()}</b></span>
        {sentTo && <span className="cs-pill wn-sent">{`The invite goes to ${sentTo}`}</span>}
        {!sentTo && onEmail && <button type="button" className="cs-btn wn-go" aria-label="Email me the invite" onClick={() => setInviting(true)}><span>Email <span className="wn-lg">me the </span>invite</span></button>}
        <button type="button" className="cs-btn wn-alt" onClick={ask}>Not you?</button>
      </>}
    </div>
  </div> : null;
  // What the pill in a fine poll's key says: the box being marked, else the time last touched.
  const on = touched ? slotOf.get(touched) : undefined;
  const said = live ? `${live.on ? '' : 'Clearing '}${live.c0 === live.c1 ? `${dow(shown[live.c0])} ${dayNum(shown[live.c0])}` : `${dow(shown[live.c0])} to ${dow(shown[live.c1])} ${dayNum(shown[live.c1])}`}, ${spanText(timeOf(live.from), (live.to - live.from) * step)}`
    : on ? `${dow(on.day)} ${dayNum(on.day)}, ${hourText(on.hour, on.minute)} · ${count(on.at) ? `${count(on.at)} free` : 'nobody yet'}` : onSave ? 'Drag to mark' : 'Touch a time';
  const strips = fine && <div ref={box} className="wn-grid fine" role="group" aria-label={onSave ? 'Times you can make' : 'When people are free'} style={{ '--days': per, '--tall': tall } as React.CSSProperties}>
    <span />{shown.map((day, col) => <span key={day} className={`wn-d${live && col >= live.c0 && col <= live.c1 ? ' lit' : ''}`}>{dow(day)}<b>{dayNum(day)}</b></span>)}{pad}
    <span className="wn-hs" aria-hidden="true">{Array.from({ length: tall + 1 }, (_, n) => <span key={n} className="wn-h" style={{ top: `${n / tall * 100}%` }}>{hourText(firstHour + n)}</span>)}</span>
    <div className="wn-sheet" style={{ gridColumn: `2 / span ${shown.length}`, '--cols': shown.length } as React.CSSProperties} onPointerDown={press} onPointerMove={glide} onPointerUp={lift} onPointerCancel={lift} onLostPointerCapture={lift}>
      {shown.map((day, col) => {
        const cells: ReactNode[] = [], runs: [number, number][] = [];
        for (let row = 0; row < rows; row++) {
          const slot = slotAt(day, row), hour = row % perHour ? '' : ' h';
          if (!slot) { cells.push(<i key={row} className={`c${hour}`} />); continue; }
          cells.push(<i key={row} className={`c${hour}${slot === won ? ' won' : ''}${slot === touched && !live ? ' at' : ''}`} style={{ '--n': Math.min(count(slot), 5) } as React.CSSProperties} />);
          if (picked.has(slot)) { const last = runs[runs.length - 1]; if (last?.[1] === row) last[1] = row + 1; else runs.push([row, row + 1]); }
        }
        // A block says when it starts along its top edge and when it ends along its foot; a short one says both on one line, and a quarter of an hour says nothing.
        const label = (from: number, to: number) => { const text = spanText(timeOf(from), (to - from) * step), at = text.indexOf(' to '); return (to - from) * step >= 45 ? <><b>{text.slice(0, at)}</b><b>{text.slice(at + 4)}</b></> : (to - from) * step >= 30 ? text.replace(/ [ap]m$/, '') : null; };
        return <div key={day} className="wn-trk" tabIndex={0} aria-label={`${dayLabel(day)}${onSave ? ': drag to paint, or use the arrow keys and Space' : ''}`} onKeyDown={stripKeys(day, col)}>
          {cells}{runs.map(([from, to]) => <span key={from} className={`wn-blk${(to - from) * step >= 45 ? ' ends' : ''}`} style={{ top: `calc(${pct(from)} + 2px)`, height: `calc(${pct(to - from)} - 3px)` }}>{label(from, to)}</span>)}
        </div>;
      })}
    </div>{pad.map((_, n) => <span key={`strip${n}`} />)}
  </div>;
  return <>
    <div className="wn-col"><Panel tab={tab ?? (onSave ? 'Paint the times you can make' : 'When people are free so far')}>{pager}
      {strips || <div ref={box} className="wn-grid" role="group" aria-label={onSave ? 'Times you can make' : 'When people are free'} style={{ '--days': per } as React.CSSProperties}>
        <span />{shown.map(day => <span key={day} className="wn-d">{dow(day)}<b>{dayNum(day)}</b></span>)}{pad}
        {hours.map((hour, row) => [<span key={hour} className="wn-h">{clock(hour)}</span>, ...shown.map((day, col) => {
          const slot = at.get(`${day} ${hour}`);
          if (!slot) return <span key={day} className="wn-none" />;
          const on = picked.has(slot), total = count(slot), badge = rank.has(slot) && <i className="wn-rk" aria-hidden="true">{rank.get(slot)}</i>;
          const look = { className: `wn-cell${slot === won ? ' won' : ''}${slot === touched ? ' sel' : ''}`, 'data-n': Math.min(total, 5), style: { '--n': Math.min(total, 5) } as React.CSSProperties };
          if (!onSave) return <button key={day} type="button" {...look} aria-label={`${dayLabel(day)}, ${clock(hour)}: ${total} free`} onClick={() => setTouched(slot)}>{total}{badge}</button>;
          return <button key={day} type="button" {...look} data-r={row} data-c={col}
            aria-pressed={on} aria-label={`${dayLabel(day)}, ${clock(hour)}`} tabIndex={slot === first ? 0 : -1}
            onPointerDown={down(slot)} onPointerEnter={() => { if (painting.current !== null) paint(slot, painting.current); }} onKeyDown={keys} onFocus={() => setTouched(slot)}
            // A press already painted on the way down. A click that no pointer made is the keyboard's.
            onClick={event => { if (event.detail === 0) paint(slot, !on); }}>{total}{badge}</button>;
        }), ...pad.map((_, n) => <span key={`pad${hour}${n}`} />)])}
      </div>}
      <div className="wn-key"><span className="cs-pill"><i className="t1" /><i className="t3" /><i className="t5" />{fine ? 'More free' : 'More people free'}</span>{onSave && <span className="cs-pill"><i className="mine" />{fine ? 'You' : 'Yours'}</span>}{children}{fine && <span className="cs-pill wn-said" aria-live="polite">{said}</span>}</div></Panel>
      {strip}
      {onSave && guest ? <div className="wn-save wn-who">
        {error && !asking && <p className="wn-note bad" role="alert">{error}</p>}
        {/* Someone this browser already knows saves straight away; anyone else is asked who they are first. */}
        {(changed || !kept) && !(saving && kept) && <button className="cs-btn go wn-big" type="button" disabled={busy} onClick={() => { if (kept || ready) void save(); else ask(); }}>{(busy && !asking) || saving ? 'Saving' : 'Save my times'}</button>}
        {asking && <div className="cs-over" role="dialog" aria-modal="true" aria-label="Whose times are these?" onClick={event => { if (event.target === event.currentTarget) shut(); }}>
          <div className="cs-over-card wn-card"><button type="button" className="cs-btn sm cs-over-x" onClick={shut}>Close</button>
            <div className="wn-card-top"><h2>Whose times are these?</h2><Rings /></div>
            <div className="wn-halves">
              {/* Each half is one capsule: the name is typed into the first, and the ways into Loopd sit in the second. */}
              <div className="wn-half">
                <div className={`wn-cap${miss ? ' miss' : ''}`}>
                  <i key={name.trim().charAt(0)} className={`cs-face wn-ini${name.trim() ? '' : ' none'}`} aria-hidden="true">{name.trim().charAt(0).toUpperCase() || '?'}</i>
                  <input ref={who} autoFocus aria-label="Your name" value={name} maxLength={40} autoComplete="name" placeholder="Your name" onChange={event => { setName(event.target.value); setMiss(false); }} onKeyDown={enter(named)} />
                  <button className="cs-btn wn-go" type="button" disabled={busy} onClick={named}>{busy ? 'Saving' : picked.size > 0 ? 'Save my times' : 'Pick my times'}</button>
                </div>
                {error && <p className="wn-note bad" role="alert">{error}</p>}
              </div>
              {ways && <div className="wn-half lo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="wn-cap lime"><span className="wn-pets" aria-hidden="true">{PETS.map(pet => <img key={pet} className="cs-face" src={`/animals/${pet}.webp`} alt="" />)}</span>{ways}</div>
              </div>}
            </div>
          </div>
        </div>}
      </div> : onSave ? <div className="wn-save">
        {error && <p className="wn-note bad" role="alert">{error}</p>}
        <button className="cs-btn go wn-big" type="button" disabled={busy} onClick={() => void save()}>{busy || saving ? 'Saving' : changed || !kept ? 'Save my times' : 'Saved'}</button>
        <p className="wn-note" role="status">{saving ? 'Saving as you paint.' : changed ? 'Not saved yet.' : after}</p>
      </div> : null}
    </div>
    <div className="wn-col side"><Ticket tile={tile} stub={stub}>{title}</Ticket>
      {best.length > 0 && <div className="wn-best"><Panel tab="Best so far, all days"><div className="wn-picks">{best.map(each => <button key={each.at} type="button" aria-label={`Show ${each.dow} ${each.date}, ${each.time}`}
        onClick={() => { setTurned(Math.max(0, pages.findIndex(set => set.includes(slotOf.get(each.at)?.day ?? '')))); setTouched(each.at); }}>
        <Tile top={each.dow} big={each.date} /><span><b>{each.time}</b><small>{each.line}</small></span><Stack people={each.people} /></button>)}</div></Panel></div>}
      <div className="wn-tail">{!onSave && action}{tail}</div></div>
  </>;
}
