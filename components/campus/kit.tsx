'use client';

import { useEffect } from 'react';

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

/** Keeps the kit right when a campus page is reached without a page load: the person's pick, or else `own`. */
export function Kit({ own }: { own: string }) {
  useEffect(() => { showKit(pickedKit() ?? own); }, [own]);
  return null;
}
