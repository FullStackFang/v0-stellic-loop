'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { INK_PAGE } from '@/lib/campus/ink';
import { InkMark } from './ink-mark';

// A kit is one school's colours for the campus screen. The values live in app/c/campus.css under [data-kit]; this is
// the list of them and the one place that says which is on. "loop" is the look with no school.
export const KITS = [
  { slug: 'loop', name: 'Loop', ink: '#0d2747' },
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

/**
 * The kits a person may wear: Loop's own and their school's (`own`). Another school's colours are an Ink+ perk: `any`
 * is whether they may wear every kit. The scripts that set the kit before the page is painted follow the same rule
 * (components/campus/shell.tsx, app/groups/layout.tsx).
 */
export const kitsFor = (own: string, any: boolean) => KITS.filter(each => any || each.slug === 'loop' || each.slug === own);
/** The person's pick if it is one they may wear, or else `own`. */
const worn = (own: string, any: boolean) => { const picked = pickedKit(); return kitsFor(own, any).some(each => each.slug === picked) ? picked! : own; };

/** Keeps the kit right when a campus page is reached without a page load: the person's pick if they may wear it, or else `own`. */
export function Kit({ own, any }: { own: string; any: boolean }) {
  useEffect(() => { showKit(worn(own, any)); }, [own, any]);
  return null;
}

/** The colours of the account card: the kits the person may wear, and for someone without Ink+ the way to the rest. It is mounted when the card opens. */
export function Kits({ own, any, className = '' }: { own: string; any: boolean; className?: string }) {
  const [kit, setKit] = useState(kitNow);
  return <div className={`cs-kits ${className}`} role="group" aria-label="Colours"><h4>Colours</h4><div>
    {kitsFor(own, any).map(each => <button key={each.slug} className="cs-kit" data-kit={each.slug} aria-pressed={kit === each.slug} onClick={() => { pickKit(each.slug); setKit(each.slug); }}><i />{each.name}</button>)}
    {!any && <Link className="cs-kit more" href={INK_PAGE}><InkMark />Every school with Ink+</Link>}</div></div>;
}
