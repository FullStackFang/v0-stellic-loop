'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Rings } from '@/components/LoopGlyphs';
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

/** The event the bar's "Sign in" sends before opening its own card: a poll's guest card answers it and opens instead. */
export const WHO = 'loopd:who';
/** Where what is painted is kept in this tab while someone signs in: one place per poll. */
const keepKey = () => `wn-keep:${location.pathname}`;
// The animals on "Have Loopd?": signing in is what brings yours.
const PETS = ['07', '03', '12'];

/**
 * The grid of a poll, under its ticket (public/demo/mockups-when-fit.html, 3). A few days show at a time, the first
 * ones first; each set's pill says its best count, and the three best times of all carry a 1, 2 or 3. The stub of the
 * ticket says who can make one time: the best so far, then whichever time was last touched.
 *
 * With `onSave` a person paints their times: press and drag to paint, starting on a painted time to rub out; the arrow
 * keys move and Space paints. Each time shows how many can make it, the person included, and nothing is kept until
 * Save. Without `onSave` it is only to look at, and `action` stands where Save would.
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
  const per = usePer(), days = [...new Set(slots.map(slot => slot.day))], hours = [...new Set(slots.map(slot => slot.hour))].sort((a, b) => a - b);
  const at = new Map(slots.map(slot => [`${slot.day} ${slot.hour}`, slot.at])), slotOf = new Map(slots.map(slot => [slot.at, slot]));
  const pages = Array.from({ length: Math.max(1, Math.ceil(days.length / per)) }, (_, page) => days.slice(page * per, (page + 1) * per));
  const [picked, setPicked] = useState(() => new Set(mine)), [saved, setSaved] = useState(() => new Set(draft ? [] : mine)), [kept, setKept] = useState(mine.length > 0 && !draft);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [touched, setTouched] = useState<string | null>(null);
  const [turned, setTurned] = useState(0), page = Math.min(turned, pages.length - 1), shown = pages[page];
  const painting = useRef<boolean | null>(null), box = useRef<HTMLDivElement>(null), field = useRef<HTMLInputElement>(null);
  const [asking, setAsking] = useState(false), who = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(guest?.name ?? ''), [email, setEmail] = useState(''), [sentTo, setSentTo] = useState(guest?.email ?? null), [miss, setMiss] = useState(false);
  // A guest is drawn as the initial of the name they are typing.
  const me = guest && given ? { ...given, name: name.trim() || '?' } : given;
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
  /** Saves the painted times, or `these`. Says whether it did. */
  const save = async (these?: string[]) => {
    if (!onSave) return false;
    if (guest && !name.trim()) { setMiss(true); who.current?.focus(); return false; }
    setBusy(true); setError(''); if (these) setPicked(new Set(these));
    const now = these ?? [...picked], result = await onSave(now, guest ? name.trim() : undefined).catch(() => ({ error: 'That did not save. Try again.' }));
    setBusy(false);
    if (result?.error) { setError(result.error); return false; }
    setSaved(new Set(now)); setKept(true); return true;
  };
  // The card that asks a guest who they are (public/demo/mockups-when-one-card-4.html). What is painted is kept in
  // this tab while it is open, so signing in from it, which loads the page again, does not lose it.
  const ask = () => { try { sessionStorage.setItem(keepKey(), JSON.stringify([...picked])); } catch { /* a browser that keeps nothing */ } setMiss(false); setError(''); setAsking(true); };
  const shut = () => { try { sessionStorage.removeItem(keepKey()); } catch { /* nothing kept */ } setAsking(false); };
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
      {onSave && guest ? <div className="wn-save wn-who">
        {error && !asking && <p className="wn-note bad" role="alert">{error}</p>}
        {/* Someone this browser already knows saves straight away; anyone else is asked who they are first. */}
        {changed || !kept ? <button className="cs-btn go wn-big" type="button" disabled={busy} onClick={() => { if (kept || guest.name) void save(); else ask(); }}>{busy && !asking ? 'Saving' : 'Save my times'}</button> : <>
          <div className="wn-done" role="status"><span className="wn-as"><i className="cs-face wn-ini" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</i><span className="cs-pill yes">Saved as {name.trim()}</span></span>
            <button type="button" className="cs-btn sm" onClick={ask}>Not {name.trim()}?</button>{sentTo && <span>The invite goes to {sentTo}</span>}</div>
          {!sentTo && onEmail && <div className="wn-ask">
            <label className={`wn-f${miss ? ' miss' : ''}`}><span>Want the invite when the time is set?</span><input ref={field} type="email" value={email} maxLength={254} autoComplete="email" placeholder="you@email.com" onChange={event => { setEmail(event.target.value); setMiss(false); }} onKeyDown={enter(send)} /></label>
            <button className="cs-btn go wn-big" type="button" disabled={busy} onClick={send}>{busy ? 'Sending' : 'Send it to me'}</button>
          </div>}
        </>}
        {asking && <div className="cs-over" role="dialog" aria-modal="true" aria-label="Whose times are these?" onClick={event => { if (event.target === event.currentTarget) shut(); }}>
          <div className="cs-over-card wn-card"><button type="button" className="cs-btn sm cs-over-x" onClick={shut}>Close</button>
            <div className="wn-card-top"><h2>Whose times are these?</h2><Rings /></div>
            <div className="wn-halves">
              <div className="wn-half">
                <span className="wn-tag"><i key={name.trim().charAt(0)} className={`cs-face wn-ini${name.trim() ? '' : ' none'}`} aria-hidden="true">{name.trim().charAt(0).toUpperCase() || '?'}</i><b>Just a name</b></span>
                {error && <p className="wn-note bad" role="alert">{error}</p>}
                <div className="wn-ask">
                  <label className={`wn-f${miss ? ' miss' : ''}`}><span>Your name</span><input ref={who} autoFocus value={name} maxLength={40} autoComplete="name" placeholder="Type your name" onChange={event => { setName(event.target.value); setMiss(false); }} onKeyDown={enter(async () => { if (await save()) shut(); })} /></label>
                  <button className="cs-btn go wn-big" type="button" disabled={busy} onClick={async () => { if (await save()) shut(); }}>{busy ? 'Saving' : 'Save my times'}</button>
                </div>
              </div>
              {ways && <div className="wn-half lo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <span className="wn-tag lime"><span className="wn-pets" aria-hidden="true">{PETS.map(pet => <img key={pet} className="cs-face" src={`/animals/${pet}.webp`} alt="" />)}</span><b>Have Loopd?</b></span>
                {ways}
              </div>}
            </div>
          </div>
        </div>}
      </div> : onSave ? <div className="wn-save">
        {error && <p className="wn-note bad" role="alert">{error}</p>}
        <button className="cs-btn go wn-big" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving' : changed || !kept ? 'Save my times' : 'Saved'}</button>
        <p className="wn-note" role="status">{changed ? 'Not saved yet.' : after}</p>
      </div> : action}
      {tail}</div>
  </>;
}
