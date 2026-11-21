'use client';

import { useEffect, useState } from 'react';
import { WORN } from '@/lib/campus/kit-script';
import { SeatsTicket } from './seats';

// The one ticket of the app (public/demo/mockups-loading-one.html, direction B). A page arrives in pieces: the layout,
// the page under it, the counters in its bar. Each piece has a loader of its own, and when each drew its own ticket a
// load showed one ticket after another, each with its own ending. So the loaders draw no ticket: they only say that
// they are waiting (WAIT), and this one ticket, in the root layout and outside every piece, is drawn while any of them
// is. It is never redrawn as one piece takes the place of another, and it has one ending.
//
// On a fresh load it covers the whole screen, on the colours this browser last wore, until every piece has come: the
// page, and the counters of its bar (SeatsSmall with `first`), which are read from the start, beside the page
// (app/c/on-you.tsx), so that waiting for them costs little. The pieces arrive before React has the page, so that showing and hiding is done by the
// style sheet (seats.css, .seats-fresh). After that a change of page keeps its bar and the ticket stands under it, for
// as long as a page-sized loader is on the page.

/** What a page-sized loader carries: the ticket is drawn for as long as one is on the page. */
export const WAIT = { 'data-seats-wait': 'page' } as const;

/** Mounted once, in the root layout. */
export function FreshWait() {
  const [fresh, setFresh] = useState(true), [waiting, setWaiting] = useState(false);
  useEffect(() => {
    let first = true;
    const watch = new MutationObserver(look);
    function look() {
      if (first && !document.querySelector('[data-seats-wait]')) { first = false; setFresh(false); }
      setWaiting(!first && document.querySelector('[data-seats-wait="page"]') !== null);
    }
    watch.observe(document.body, { childList: true, subtree: true });
    look();
    return () => watch.disconnect();
  }, []);
  // The colours are the ones this browser last wore, put on before the first paint, so the cover does not change colour
  // when the page under it says whose they are. The server cannot know them: the attribute differs from what it sent.
  if (fresh) return <div className="cs seats-screen seats-fresh">
    <div className="seats-fresh-in" suppressHydrationWarning><SeatsTicket page /></div>
    <script dangerouslySetInnerHTML={{ __html: `try{var k=localStorage.getItem('${WORN}');if(k)document.currentScript.previousElementSibling.dataset.kit=k}catch(e){}` }} />
  </div>;
  return waiting ? <div className="seats-page seats-layer"><SeatsTicket page /></div> : null;
}
