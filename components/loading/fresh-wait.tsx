'use client';

import { useEffect, useState } from 'react';
import { WORN } from '@/lib/campus/kit-script';
import { SeatsTicket } from './seats';

// A fresh load is one ticket, then everything (public/demo/mockups-loading-one.html, direction B). A page arrives in
// pieces: the layout, the page under it, the counters in its bar. Each piece has a loader of its own, so a fresh load
// showed one after another and the ticket was drawn again part-way. This one ticket is in the root layout, outside
// every piece, so it is never redrawn: it covers the screen for as long as any first wait is on the page, and the
// pieces land under it.
//
// The pieces arrive before React has the page, so showing and hiding is done by the style sheet (seats.css, .seats-fresh):
// the cover shows while the page holds anything marked with FIRST. Once nothing is, React takes the cover away for good,
// and a later change of page shows its own loader under the bar, as before.

/** What a loader carries when it is one of the waits a fresh load is held for: a whole page, or a part of its bar. */
export const FIRST = { 'data-seats-wait': '' } as const;
const waiting = () => document.querySelector('[data-seats-wait]') !== null;

/** Mounted once, in the root layout. */
export function FreshWait() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const watch = new MutationObserver(look);
    function look() { if (!waiting()) { watch.disconnect(); setOn(false); } }
    watch.observe(document.body, { childList: true, subtree: true });
    look();
    return () => watch.disconnect();
  }, []);
  if (!on) return null;
  // The colours are the ones this browser last wore, put on before the first paint, so the cover does not change colour
  // when the page under it says whose they are. The server cannot know them: the attribute differs from what it sent.
  return <div className="cs seats-screen seats-fresh">
    <div className="seats-fresh-in" suppressHydrationWarning><SeatsTicket page /></div>
    <script dangerouslySetInnerHTML={{ __html: `try{var k=localStorage.getItem('${WORN}');if(k)document.currentScript.previousElementSibling.dataset.kit=k}catch(e){}` }} />
  </div>;
}
