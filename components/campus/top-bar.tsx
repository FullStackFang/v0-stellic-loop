'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { INK_PAGE } from '@/lib/campus/ink';
import type { BarGroup } from '@/lib/campus/bar-groups';
import { groupPath } from '@/lib/emba/group-path';
import { InkMark } from './ink-mark';

/** How many groups the bar names before it leaves the rest to "All groups". */
const SHOWN = 5;
/** `on` for the page that lists every group. */
export const ALL_GROUPS = 'all';

/**
 * The one top bar of the app, the same on every page: the wordmark, "This week", the person's groups, "All groups",
 * Ink, then what the page puts at the end (`children`) and the account (`account`). A group inside another is named
 * only while the person is in it. `home` is where "This week" leads. `on` is the page this is: 'week', 'ink',
 * ALL_GROUPS, or the id of the group the person is in.
 */
export function TopBar({ home = '/', on, groups = [], all = groups.length > 0, account, children }: { home?: string; on?: string; groups?: BarGroup[]; /** Whether "All groups" is there. Someone in no group has no groups page to go to (app/groups/layout.tsx sends them back to the front door). */ all?: boolean; /** The end of the bar: the account card, or the way in. */ account: ReactNode; /** What a page puts before the account. */ children?: ReactNode }) {
  const current = groups.find(group => group.id === on);
  const top = groups.filter(group => group.depth === 0).slice(0, SHOWN);
  const shown = current && !top.includes(current) ? [...top, current] : top;
  return <header className="cs-nav">
    <Link className="cs-wm" href={home}><Rings />Loop</Link>
    <nav className="cs-links" aria-label="Loop"><Link href={home} aria-current={on === 'week' ? 'page' : undefined}>This week</Link>
      {shown.map(group => <Link key={group.id} href={`${groupPath(group.namespace, group.slug)}/team`} aria-current={group === current ? 'page' : undefined}><i>{group.name.slice(0, 1).toUpperCase()}</i>{group.name}</Link>)}
      {all && <Link href="/groups" aria-current={on === ALL_GROUPS ? 'page' : undefined}>All groups</Link>}
      <Link className="cs-inktab" href={INK_PAGE} aria-label="Ink" aria-current={on === 'ink' ? 'page' : undefined}><InkMark /><span>Ink</span></Link></nav>
    <div className="cs-nav-end">{children}{account}</div>
  </header>;
}

/** The groups pages' own links, for the account card: the same on every page that has the bar. */
export function GroupLinks({ all }: { /** With "How we got here", which the admin's card already has. */ all: boolean }) {
  return <><Link href="/groups/connections">Assistants</Link><Link href="/groups/reach">Reach</Link>{all && <Link href="/groups/archive">How we got here</Link>}</>;
}
