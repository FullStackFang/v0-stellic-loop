'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { InkMark } from '@/components/campus/ink-mark';
import { KITS, kitNow, pickKit } from '@/components/campus/kit';
import { INK_PAGE } from '@/lib/campus/ink';
import { ROOT_SLUG, groupPath } from '@/lib/emba/group-path';

/** A group in the bar, in tree order: `depth` is how many groups it sits inside that the person can open. */
export type BarGroup = { id: string; parent: string | null; namespace: string; slug: string; name: string; handle: string; depth: number };
/** How many groups the bar names before it leaves the rest to "All groups". */
const SHOWN = 5;

/**
 * The top bar of the groups pages, the same one the campus screen has: the way back to This week, the person's
 * groups, and their account with the school colours. A group inside another is named only while the person is in it.
 */
export function Bar({ groups, face, ink = false, account }: { groups: BarGroup[]; face: string | null; /** Whether the person has Loop Ink: their avatar wears its mark. */ ink?: boolean; account: ReactNode }) {
  const path = usePathname();
  const { namespace, slug = ROOT_SLUG } = useParams<{ namespace?: string; slug?: string }>();
  const current = groups.find(group => group.namespace === namespace && group.slug === slug);
  const top = groups.filter(group => group.depth === 0).slice(0, SHOWN);
  const shown = current && !top.includes(current) ? [...top, current] : top;
  const [open, setOpen] = useState(false), [kit, setKit] = useState('loop'), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); }, key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('click', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', key); };
  }, [open]);
  // eslint-disable-next-line @next/next/no-img-element -- an icon from public/animals
  const you = face ? <img className="cs-face pet" src={face} alt="" /> : <span className="cs-face">You</span>;
  return <header className="cs-nav">
    <Link className="cs-wm" href="/"><Rings />Loop</Link>
    <nav className="cs-links" aria-label="Your groups"><Link href="/">This week</Link>
      {shown.map(group => <Link key={group.id} href={`${groupPath(group.namespace, group.slug)}/team`} aria-current={group === current ? 'page' : undefined}><i>{group.name.slice(0, 1).toUpperCase()}</i>{group.name}</Link>)}
      <Link href="/groups" aria-current={path === '/groups' ? 'page' : undefined}>All groups</Link>
      {/* The Ink page is a file in public/, not a page of the app, so it is a plain link. */}
      <a className="cs-inktab" href={INK_PAGE} aria-label="Ink"><InkMark /><span>Ink</span></a></nav>
    <div className="cs-nav-end"><div className="cs-acct" ref={box}>
      <button aria-expanded={open} aria-label={`Your account and colours${ink ? '. You have Ink' : ''}`} onClick={() => { setKit(kitNow()); setOpen(!open); }}>
        <span className="cs-ava">{ink ? <span className="cs-inked">{you}<InkMark /></span> : you}</span></button>
      {open && <div className="cs-lvl" role="dialog" aria-label="Your account"><div className="cs-lvl-body">
        <div className="cs-kits gb-kits" role="group" aria-label="Colours"><h4>Colours</h4><div>{KITS.map(each => <button key={each.slug} className="cs-kit" data-kit={each.slug} aria-pressed={kit === each.slug} onClick={() => { pickKit(each.slug); setKit(each.slug); }}><i />{each.name}</button>)}</div></div>
        <nav className="cs-lvl-more" aria-label="You"><Link href="/groups/connections">Assistants</Link><Link href="/groups/reach">Reach</Link><Link href="/groups/archive">How we got here</Link></nav>
        {account && <div className="cs-lvl-more gb-account">{account}</div>}</div></div>}
    </div></div>
  </header>;
}
