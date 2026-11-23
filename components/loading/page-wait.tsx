'use client';

import { usePathname } from 'next/navigation';
import { TopBar } from '@/components/campus/top-bar';
import { WAIT } from './fresh-wait';
import { lastBar } from './last-bar';

/** The pages that wear the app's top bar outside /groups: the front door, everything under /c, and Conga. */
const barred = (path: string | null) => path === '/' || !!path?.startsWith('/c/') || path === '/conga';

/**
 * What a page shows while it loads (openspec loop-loading-seats). After a page that had the top bar, the bar stays: the
 * same links, the pressed one marked and holding the small one. On a fresh load, or on a page with no bar, the school's
 * colour alone. The ticket itself is not drawn here: this says the page is waiting, and the one ticket of the app
 * (fresh-wait.tsx) stands over it, so it is not drawn again when the next piece of the page takes this one's place.
 */
export function PageWait() {
  const path = usePathname(), { bar, going } = lastBar();
  if (!bar || !barred(path)) return <div className="cs seats-screen" {...WAIT} />;
  return <div className="cs"><TopBar {...bar} going={going ?? ''} /><div className="seats-page" {...WAIT} /></div>;
}

/** The same, for a page whose bar is in its layout and so never left (the groups pages). */
export function PartWait() {
  return <div className="seats-page" {...WAIT} />;
}
