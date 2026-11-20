'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { KITS, kitNow, pickKit } from './kit';
import './foot.css';

/** The colours in use are the page's `data-kit`: the dot that wears the ring follows it, whoever changes it. */
const onKit = (changed: () => void) => { const watch = new MutationObserver(changed); watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-kit'] }); return () => watch.disconnect(); };

/**
 * The foot of every page (public/demo/mockups-footer.html): one bar with the small print and the colours. The crowd
 * ticket that stood above it lives on in Seats (public/seats, a doodle). The ways around are the top bar's, Assistants
 * among them (components/campus/assistants-link.tsx). `home` is where the wordmark leads.
 */
export function SiteFoot({ home = '/', kit: worn }: { home?: string; /** The colours the page it ends has put on (the front door, which turns from school to school). Then the foot wears them too, and has no colours of its own to pick. */ kit?: string }) {
  const kit = useSyncExternalStore(onKit, kitNow, () => null);
  // Inside a page that wears colours of its own, the foot is not a .cs box: a .cs takes the colours of the whole site, over the page it ends.
  return <footer className={worn ? "cs-ft" : "cs cs-ft"} data-kit={worn}>
    <div className="cs-ft-bar"><Link className="cs-wm" href={home}><Rings />Loopd</Link>
      <nav aria-label="Loopd, at the foot">        <Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></nav>
      <div className="cs-ft-end"><small>© 2026 Loopd</small>
        {!worn && <div className="cs-ft-kits" role="group" aria-label="Colours">{KITS.map(each => <button key={each.slug} data-kit={each.slug} aria-label={`${each.name} colours`} title={each.name} aria-pressed={kit === each.slug} onClick={() => pickKit(each.slug)} />)}</div>}</div></div>
  </footer>;
}
