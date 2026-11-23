'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { FaceTags } from './face-tag';
import { InkMark } from './ink-mark';
import { InkColours, KITS, mayWear, pickKit, useLook } from './kit';
import './foot.css';

/**
 * The foot of every page (public/demo/mockups-footer.html): one bar with the small print and the colours. The crowd
 * ticket that stood above it lived on in Seats for a while (a doodle; it is three games now, components/doodles). The ways around are the top bar's, Assistants
 * among them (components/campus/assistants-link.tsx). `home` is where the wordmark leads.
 * The colours are a dot for each school the person may wear, named: the one on always, another while it is pointed at
 * (public/demo/mockups-school-labels.html, foot C). The tag a face shows when pointed at is mounted here too (face-tag.tsx). Someone signed in without Ink has their own, and one pill,
 * "Every school" with the Ink mark, whose card says the rest come with it (public/demo/mockups-ink-colours.html, "My pick").
 */
export function SiteFoot({ home = '/', kit: worn }: { home?: string; /** The colours the page it ends has put on (the front door, which turns from school to school). Then the foot wears them too, and has no colours of its own to pick. */ kit?: string }) {
  const { kit, yours, any } = useLook(), [asking, setAsking] = useState(false), [open, setOpen] = useState(false), locked = !!yours && !any;
  // Inside a page that wears colours of its own, the foot is not a .cs box: a .cs takes the colours of the whole site, over the page it ends.
  return <footer className={worn ? "cs-ft" : "cs cs-ft"} data-kit={worn}>
    <div className="cs-ft-bar"><Link className="cs-wm" href={home}><Rings />Loopd</Link>
      <nav aria-label="Loopd, at the foot">        <Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></nav>
      <div className="cs-ft-end"><small>© 2026 Loopd</small>
        {/* On a phone the colours fold into one dot, the one worn, that opens them in a card above (public/demo/mockups-footer-phone.html, D). */}
        {!worn && <button type="button" className="cs-ft-lookbtn" data-kit={kit} aria-label={`Colours: ${KITS.find(each => each.slug === kit)?.name ?? ''}`} aria-expanded={open} onClick={() => setOpen(!open)}><i /></button>}
        {!worn && <div className="cs-ft-look" data-open={open || undefined}>
          <div className="cs-ft-kits" role="group" aria-label="Colours">{KITS.filter(each => mayWear(each.slug, yours, any)).map(each => <button key={each.slug} data-kit={each.slug} aria-label={`${each.name} colours`} aria-pressed={kit === each.slug} onClick={() => { pickKit(each.slug); setOpen(false); }}><i /><span><b>{each.name}</b></span></button>)}</div>
          {locked && <span className="cs-ft-inkpick"><button type="button" className="cs-ft-asst" aria-label="Every school, with Ink" aria-expanded={asking} data-open={asking || undefined} onClick={() => setAsking(!asking)}><InkMark />Every school</button>
            {asking && <InkColours yours={yours} onClose={() => setAsking(false)} />}</span>}</div>}</div></div>
    <FaceTags />
  </footer>;
}
