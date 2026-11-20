'use client';

import { useLinkStatus } from 'next/link';
import { SeatsSmall } from './seats';

/**
 * The small one on a link that was pressed and has not arrived (openspec loop-loading-seats, design D4). It goes inside
 * a <Link>. It sits on the link's corner like a badge, in a box that is always there, so the link never changes width.
 * It says nothing to a screen reader: the page's own loading state does.
 */
export function LinkWait({ on = false }: { /** Shown whatever the link says: for the copy of the bar a loading state draws. */ on?: boolean }) {
  const { pending } = useLinkStatus(), shown = pending || on;
  return <span className="seats-linkwait" data-on={shown ? '' : undefined} aria-hidden="true">{shown && <SeatsSmall plate size={18} />}</span>;
}
