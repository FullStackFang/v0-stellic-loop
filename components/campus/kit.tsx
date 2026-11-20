'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { INK_PAGE } from '@/lib/campus/ink';
import { InkMark } from './ink-mark';
import './foot.css';
import './kits.css';

// A kit is one school's colours for the campus screen. The values live in app/c/campus.css under [data-kit]; this is
// the list of them and the one place that says which is on. "loop" is the look with no school.
export const KITS = [
  { slug: 'loop', name: 'Loopd', ink: '#0d2747' },
  { slug: 'columbia', name: 'Columbia', ink: '#0c2340' },
  { slug: 'cornell', name: 'Cornell', ink: '#2a1815' },
  { slug: 'cuny', name: 'CUNY', ink: '#0a1f4d' },
  { slug: 'nyu', name: 'NYU', ink: '#2a0f45' },
] as const;

const KEY = 'loop-kit';
/** The kit this person picked on this browser, if any. */
export function pickedKit(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }
/** The kit showing now. */
export const kitNow = () => (typeof document === 'undefined' ? null : document.documentElement.dataset.kit) ?? 'loop';
/** Show a kit without keeping it (the sign-in card, as an email is typed). */
export function showKit(slug: string) { document.documentElement.dataset.kit = slug; }
/** Pick a kit: show it and keep it on this browser. */
export function pickKit(slug: string) { try { localStorage.setItem(KEY, slug); } catch { /* shown, not kept */ } showKit(slug); }

// Who may wear what (public/demo/mockups-ink-colours.html, "My pick"): Loopd's colours and the person's own schools'
// are free; every other school's come with Ink+. Signed out there is no one to hold to it, and any may be worn.
/** Whether `slug` may be worn by someone whose own kits are `yours` (null: signed out), with every kit when `any`. */
export const mayWear = (slug: string, yours: readonly string[] | null, any: boolean) => any || !yours || yours.includes(slug);

/** Keeps the colours right when a campus page is reached without a page load (lib/campus/kit-script.ts does it before the
    first paint): the pick kept on this browser if it may be worn, or else `own`. It also leaves on the page who may
    wear what, as data-kits and data-any-kit, for the foot, which is not handed it. */
export function Kit({ own, yours, any }: { own: string; yours: string[] | null; any: boolean }) {
  const list = yours?.join(' ') ?? null;
  useEffect(() => {
    const root = document.documentElement, mine = list === null ? null : list.split(' '), picked = pickedKit();
    if (mine) root.dataset.kits = list!; else delete root.dataset.kits;
    if (any) root.dataset.anyKit = ''; else delete root.dataset.anyKit;
    showKit(picked && KITS.some(each => each.slug === picked) && mayWear(picked, mine, any) ? picked : own);
  }, [own, list, any]);
  return null;
}

/** The colours and who may wear them, as the page has them: whoever changes them, what shows them follows. */
const onLook = (changed: () => void) => { const watch = new MutationObserver(changed); watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-kit', 'data-kits', 'data-any-kit'] }); return () => watch.disconnect(); };
const lookNow = () => { const root = document.documentElement.dataset; return `${root.kit ?? 'loop'}|${root.kits ?? ''}|${root.anyKit !== undefined}|${root.kits !== undefined}`; };
/** The kit on now, the kits the person may wear (null: signed out, or not said), and whether they may wear every one. */
export function useLook(): { kit: string | null; yours: string[] | null; any: boolean } {
  const look = useSyncExternalStore(onLook, lookNow, () => null);
  if (!look) return { kit: null, yours: null, any: true };
  const [kit, kits, any, said] = look.split('|');
  return { kit, yours: said === 'true' ? kits.split(' ').filter(Boolean) : null, any: any === 'true' };
}

const Chevron = () => <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg>;

/**
 * The card that says another school's colours come with Ink+: on top what it does here (the other schools' colours,
 * `wanted` lit when one was asked for), then what Ink+ is. It grows out of the foot's pill, or stands in the account card
 * (`inside`). Escape or "Not now" closes it.
 */
export function InkColours({ wanted = null, yours, onClose, inside = false }: { wanted?: string | null; yours: readonly string[]; onClose: () => void; inside?: boolean }) {
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [onClose]);
  const others = KITS.filter(each => !yours.includes(each.slug)), name = KITS.find(each => each.slug === wanted)?.name;
  return <div className={`cs-ft-ask cs-kit-ask${inside ? ' in' : ''}`} role="dialog" aria-label={name ? `${name}'s colours come with Ink+` : "Every school's colours come with Ink+"}>
    <span className="cs-ft-ask-tab"><InkMark />Ink+</span>
    <h3>{name ? <>Wear <em>{name}&apos;s</em> colours</> : <>Every school&apos;s <em>colours</em></>}</h3>
    <div className="cs-kit-ask-sw">{others.map(each => <i key={each.slug} data-kit={each.slug} title={each.name} className={each.slug === wanted ? 'on' : undefined} />)}</div>
    <p>Yours and Loopd&apos;s are free. The other {others.length} come with Ink+.</p>
    <span className="cs-kit-ask-gives">What Ink+ gives you</span>
    <ul><li>Every school&apos;s colours, not just yours</li><li>Play as your own animal, in Seats and Conga</li><li>The book of stamps keeps every place, for good</li></ul>
    <p className="cs-kit-ask-price">From <b>$2.99</b> a month</p>
    <div className="cs-kit-ask-acts"><Link className="cs-btn sm go" href={INK_PAGE}>See Ink+</Link><button type="button" className="cs-btn sm" onClick={onClose}>Not now</button></div>
  </div>;
}

/** Past this many other schools, the drop-down has a box to find one. */
const FIND_PAST = 6;

/**
 * The colours of the account card: Loopd's, the person's schools', and the one they wear if it is another; every other
 * school is in "Any school". Without Ink+ those wear the Ink mark, and picking one opens the Ink+ card in its place.
 */
export function Kits({ yours, any, className = '' }: { yours: string[]; any: boolean; className?: string }) {
  const kit = useLook().kit ?? 'loop', [open, setOpen] = useState(false), [find, setFind] = useState(''), [asking, setAsking] = useState<string | null>(null);
  const shown = KITS.filter(each => yours.includes(each.slug) || (each.slug === kit && mayWear(kit, yours, any))), rest = KITS.filter(each => !shown.includes(each));
  const found = rest.filter(each => each.name.toLowerCase().includes(find.trim().toLowerCase()));
  const choose = (slug: string) => { setOpen(false); setFind(''); if (mayWear(slug, yours, any)) pickKit(slug); else setAsking(slug); };
  return <div className={`cs-kits ${className}`} role="group" aria-label="Colours"><h4>Colours</h4><div>
    {shown.map(each => <button key={each.slug} type="button" className="cs-kit" data-kit={each.slug} aria-pressed={kit === each.slug} onClick={() => { setAsking(null); pickKit(each.slug); }}><i />{each.name}</button>)}
    {rest.length > 0 && <span className="cs-kit-any"><button type="button" className="cs-kit" aria-expanded={open} onClick={() => { setOpen(!open); setAsking(null); }}>Any school<Chevron /></button>
      {open && <div className="cs-kit-menu">
        {rest.length > FIND_PAST && <input type="search" value={find} onChange={event => setFind(event.target.value)} aria-label="Find a school" placeholder="Find a school" />}
        <ul>{found.map(each => { const locked = !mayWear(each.slug, yours, any); return <li key={each.slug}><button type="button" data-kit={each.slug} className={locked ? 'locked' : undefined} aria-label={locked ? `${each.name}, with Ink+` : each.name} onClick={() => choose(each.slug)}><i />{each.name}{locked && <InkMark />}</button></li>; })}</ul>
        {!any && <Link className="cs-kit-menu-ink" href={INK_PAGE}><InkMark />Every school comes with Ink+</Link>}</div>}</span>}
  </div>{asking && <InkColours wanted={asking} yours={yours} inside onClose={() => setAsking(null)} />}</div>;
}
