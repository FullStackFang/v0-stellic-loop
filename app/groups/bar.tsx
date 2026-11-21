'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { InkBlot, InkSparks } from '@/components/campus/ink-mark';
import type { Plan } from '@/lib/campus/ink';
import { Kits } from '@/components/campus/kit';
import { Account } from '@/components/campus/screen';
import { GroupLinks, TopBar } from '@/components/campus/top-bar';
import type { BarGroup } from '@/lib/campus/bar-groups';
import type { Screen } from '@/lib/campus/view';
import { rememberMe } from '@/components/loading/last-bar';

export type { BarGroup };

/**
 * The top bar of the groups pages: the app's one bar (components/campus/top-bar.tsx) with the person's account. The account is the campus
 * screen's own card (level, picture, Ink, colours), drawn from `screen`, with the groups pages' links added. Without a
 * screen (it could not be read) there is a plain card: colours, the links, the way out.
 */
export function Bar({ groups, face, plan = 'free', kits = ['loop'], anyKit = false, account, screen = null, children }: { /** The colours they may wear, and whether every school's (Ink+), for the plain card. */ kits?: string[]; anyKit?: boolean; /** The person's campus screen, for the account card. */ screen?: Screen | null; /** The "Groups" and "On you" counters, as on the campus screen. */ children?: ReactNode; groups: BarGroup[]; face: string | null; /** The person's plan: with Ink their avatar sits on its blot, with Ink+ on the blot with sparks. */ plan?: Plan; account: ReactNode }) {
  const [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); }, key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('click', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', key); };
  }, [open]);
  // Without the campus card, which says it itself, this bar says whose face the loaders show (components/loading).
  const carded = !!screen?.viewer;
  useEffect(() => { if (!carded) rememberMe({ face, plan, seed: face ?? 'You' }); }, [carded, face, plan]);
  // eslint-disable-next-line @next/next/no-img-element -- an icon from public/animals
  const you = face ? <img className="cs-face pet" src={face} alt="" /> : <span className="cs-face">You</span>;
  return <TopBar member={groups.length > 0} account={screen?.viewer
      // The admin's own list already has "How we got here".
      ? <Account screen={screen} signOut={account} more={<nav className="cs-lvl-more" aria-label="Groups"><h4>Groups</h4><GroupLinks all={!screen.viewer.admin} /></nav>} />
      : <div className="cs-acct" ref={box}>
      <button aria-expanded={open} aria-label={`Your account and colours${plan === 'plus' ? '. You have Ink+' : plan === 'ink' ? '. You have Ink' : ''}`} onClick={() => setOpen(!open)}>
        <span className="cs-ava">{plan !== 'free' ? <span className="cs-inked"><InkBlot seed={face ?? 'You'} />{you}{plan === 'plus' && <InkSparks />}</span> : you}</span></button>
      {open && <div className="cs-lvl" role="dialog" aria-label="Your account"><div className="cs-lvl-body">
        <Kits yours={kits} any={anyKit} className="gb-kits" />
        <nav className="cs-lvl-more" aria-label="You"><GroupLinks all /></nav>
        {account && <div className="cs-lvl-more gb-account">{account}</div>}</div></div>}
    </div>}>{children}</TopBar>;
}
