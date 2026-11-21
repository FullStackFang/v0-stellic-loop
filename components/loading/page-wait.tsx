'use client';

import { usePathname } from 'next/navigation';
import { TopBar } from '@/components/campus/top-bar';
import { FIRST } from './fresh-wait';
import { lastBar } from './last-bar';
import { SeatsTicket } from './seats';

/** The pages that wear the app's top bar outside /groups: the front door and everything under /c. */
const barred = (path: string | null) => path === '/' || !!path?.startsWith('/c/');

/**
 * What a page shows while it loads (openspec loop-loading-seats). After a page that had the top bar, the bar stays: the
 * same links, the pressed one marked and holding the small one, and under it the ticket. On a fresh load, or on a page
 * with no bar, the ticket stands alone on the school's colour.
 */
export function PageWait() {
  const path = usePathname(), { bar, me, going } = lastBar();
  if (!bar || !barred(path)) return <div className="cs seats-screen" {...FIRST}><SeatsTicket page {...me} /></div>;
  return <div className="cs"><TopBar {...bar} going={going ?? ''} /><div className="seats-page" {...FIRST}><SeatsTicket page {...me} /></div></div>;
}

/** The same, for a page whose bar is in its layout and so never left (the groups pages). */
export function PartWait() {
  return <div className="seats-page" {...FIRST}><SeatsTicket page {...lastBar().me} /></div>;
}
