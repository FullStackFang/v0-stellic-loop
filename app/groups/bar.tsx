'use client';

import { useParams, usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { InkBlot } from '@/components/campus/ink-mark';
import { KITS, kitNow, pickKit } from '@/components/campus/kit';
import { Account } from '@/components/campus/screen';
import { ALL_GROUPS, GroupLinks, TopBar } from '@/components/campus/top-bar';
import type { BarGroup } from '@/lib/campus/bar-groups';
import type { Screen } from '@/lib/campus/view';
import { ROOT_SLUG } from '@/lib/emba/group-path';

export type { BarGroup };

/**
 * The top bar of the groups pages: the app's one bar (components/campus/top-bar.tsx) with the person's account. The account is the campus
 * screen's own card (level, picture, Ink, colours), drawn from `screen`, with the groups pages' links added. Without a
 * screen (it could not be read) there is a plain card: colours, the links, the way out.
 */
export function Bar({ groups, face, ink = false, account, screen = null, children }: { /** The person's campus screen, for the account card. */ screen?: Screen | null; /** The "Groups" and "On you" counters, as on the campus screen. */ children?: ReactNode; groups: BarGroup[]; face: string | null; /** Whether the person has Loop Ink: their avatar sits on its blot. */ ink?: boolean; account: ReactNode }) {
  const path = usePathname();
  const { namespace, slug = ROOT_SLUG } = useParams<{ namespace?: string; slug?: string }>();
  const on = path === '/groups' ? ALL_GROUPS : groups.find(group => group.namespace === namespace && group.slug === slug)?.id;
  const [open, setOpen] = useState(false), [kit, setKit] = useState('loop'), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); }, key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('click', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', key); };
  }, [open]);
  // eslint-disable-next-line @next/next/no-img-element -- an icon from public/animals
  const you = face ? <img className="cs-face pet" src={face} alt="" /> : <span className="cs-face">You</span>;
  return <TopBar groups={groups} on={on} all account={screen?.viewer
      // The admin's own list already has "How we got here".
      ? <Account screen={screen} signOut={account} more={<nav className="cs-lvl-more" aria-label="Groups"><h4>Groups</h4><GroupLinks all={!screen.viewer.admin} /></nav>} />
      : <div className="cs-acct" ref={box}>
      <button aria-expanded={open} aria-label={`Your account and colours${ink ? '. You have Ink' : ''}`} onClick={() => { setKit(kitNow()); setOpen(!open); }}>
        <span className="cs-ava">{ink ? <span className="cs-inked"><InkBlot seed={face ?? 'You'} />{you}</span> : you}</span></button>
      {open && <div className="cs-lvl" role="dialog" aria-label="Your account"><div className="cs-lvl-body">
        <div className="cs-kits gb-kits" role="group" aria-label="Colours"><h4>Colours</h4><div>{KITS.map(each => <button key={each.slug} className="cs-kit" data-kit={each.slug} aria-pressed={kit === each.slug} onClick={() => { pickKit(each.slug); setKit(each.slug); }}><i />{each.name}</button>)}</div></div>
        <nav className="cs-lvl-more" aria-label="You"><GroupLinks all /></nav>
        {account && <div className="cs-lvl-more gb-account">{account}</div>}</div></div>}
    </div>}>{children}</TopBar>;
}
