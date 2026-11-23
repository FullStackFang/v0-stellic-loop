'use client';

import { useEffect, useState } from 'react';
import { SeatsSmall } from './seats';

/** How long a pressed link holds the small one when the address never changes (a download, a page that will not come). */
const GIVE_UP = 8000;

/**
 * The app's one sign that a link was pressed and its page is on the way (openspec loop-loading-seats): the small one on
 * the corner of whatever was pressed, wherever it is in the app, and `data-going` on the link for a pressed look of its
 * own. It is drawn once, here, over the page, so no link has to carry it and nothing changes size. A link that holds its
 * own (the top bar's, link-wait.tsx) is left to it. It ends when the address changes, which is when the next page or its
 * loading state takes over.
 */
export function PressWait() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let link: HTMLAnchorElement | null = null, watch = 0, limit = 0;
    const done = () => { link?.removeAttribute('data-going'); link = null; clearInterval(watch); clearTimeout(limit); setAt(null); };
    const press = (event: MouseEvent) => {
      const hit = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!hit || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (hit.target && hit.target !== '_self' || hit.hasAttribute('download') || hit.querySelector('.seats-linkwait')) return;
      const to = new URL(hit.href, location.href), from = location.href;
      if (to.origin !== location.origin || to.pathname + to.search === location.pathname + location.search) return;
      done();
      const box = hit.getBoundingClientRect();
      link = hit; hit.setAttribute('data-going', '');
      setAt({ x: Math.min(innerWidth - 22, Math.max(4, box.right - 11)), y: Math.min(innerHeight - 22, Math.max(4, box.top - 9)) });
      watch = window.setInterval(() => { if (location.href !== from) done(); }, 80);
      limit = window.setTimeout(done, GIVE_UP);
    };
    document.addEventListener('click', press);
    window.addEventListener('pageshow', done);
    return () => { document.removeEventListener('click', press); window.removeEventListener('pageshow', done); done(); };
  }, []);
  return at && <span className="seats-press" style={{ left: at.x, top: at.y }} aria-hidden="true"><SeatsSmall plate size={18} /></span>;
}
