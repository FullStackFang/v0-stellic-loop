'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { DOODLES_PAGE } from '@/lib/campus/doodles';
import { IMPRINT_PAGE } from '@/lib/campus/imprint';
import { INK_PAGE } from '@/lib/campus/ink';
import { AssistantsLink } from './assistants-link';
import { InkMark } from './ink-mark';
import { pressed, rememberBar } from '@/components/loading/last-bar';
import { LinkWait } from '@/components/loading/link-wait';

/**
 * The one top bar of the app, the same on every page: the wordmark, "This week", Doodles (the page that holds the games,
 * Conga among them), Ink, and for someone in a group Assistants; then what the page puts at the end (`children`: the "Groups" and "On you" counters, which are the way to
 * every group) and the account (`account`), after "Claim your club", the way to the organizers page. `home` is where "This week" leads. `on` is the page this is: 'week', 'doodles', 'ink' or 'organizers'.
 *
 * The bar tells the loading state what it shows (components/loading/last-bar.ts), so the next page's loading state can
 * draw it again. `going` is for that copy: the address of the link that was pressed, which is marked in place of `on`.
 */
export function TopBar({ home = '/', on, member = false, going, account, children }: { home?: string; on?: string; going?: string; /** Whether the person is in a group, and so has assistants to connect. */ member?: boolean; /** The end of the bar: the account card, or the way in. */ account: ReactNode; /** What a page puts before the account. */ children?: ReactNode }) {
  useEffect(() => { if (going === undefined) rememberBar({ home, on, member, account }); });
  // On a phone the links fold into a menu (app/c/campus.css). It closes when a link is pressed, on Escape, and on a press anywhere else.
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const away = (event: Event) => { if (!(event.target as Element).closest?.('.cs-menu, .cs-burger')) setMenu(false); }, key = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false); };
    addEventListener('pointerdown', away); addEventListener('keydown', key);
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', key); };
  }, [menu]);
  /** Whether a link is the page: the one pressed, in the copy a loading state draws; else the one the page says. */
  const at = (href: string, here: boolean) => (going === undefined ? here : going === href) ? 'page' as const : undefined;
  return <header className="cs-nav">
    <Link className="cs-wm" href={home}><Rings />Loopd</Link>
    <button className="cs-burger" aria-label="Menu" aria-expanded={menu} aria-controls="cs-menu" onClick={() => setMenu(now => !now)}><i /></button>
    <div className="cs-menu" id="cs-menu" data-open={menu || undefined} onClickCapture={event => { const href = (event.target as Element).closest('a')?.getAttribute('href'); if (href) { pressed(href); setMenu(false); } }}>
    <nav className="cs-links" aria-label="Loopd">
      <Link href={home} aria-current={at(home, on === 'week')}>This week<LinkWait on={going === home} /></Link>
      <Link href={DOODLES_PAGE} aria-current={at(DOODLES_PAGE, on === 'doodles')}>Doodles<LinkWait on={going === DOODLES_PAGE} /></Link>
      <Link className="cs-inktab" href={INK_PAGE} aria-label="Ink" aria-current={at(INK_PAGE, on === 'ink')}><InkMark /><span>Ink</span><LinkWait on={going === INK_PAGE} /></Link>
      {member && <AssistantsLink />}</nav>
      {/* The organizers' door (public/demo/mockups-organizer-flow.html), then what the page adds. They sit at the bar's far end, and on a phone they are in the menu with the links. */}
      <Link className="cs-org" href={IMPRINT_PAGE} aria-current={at(IMPRINT_PAGE, on === 'organizers')}>Claim your club<LinkWait on={going === IMPRINT_PAGE} /></Link>{children}</div>
    <div className="cs-nav-end">{account}</div>
  </header>;
}

/** The groups pages' own links, for the account card: the same on every page that has the bar. */
export function GroupLinks({ all }: { /** With "How we got here", which the admin's card already has. */ all: boolean }) {
  return <><Link href="/groups/connections">Assistants</Link><Link href="/groups/reach">Reach</Link>{all && <Link href="/groups/archive">How we got here</Link>}</>;
}
