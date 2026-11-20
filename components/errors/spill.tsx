'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { SiteFoot } from '@/components/campus/foot';
import { pickedKit, showKit } from '@/components/campus/kit';
import { Rings } from '@/components/LoopGlyphs';
import { useMe } from '@/components/loading/seats';
import { inkBlot } from '@/lib/campus/ink-blot';
import { errorCode, fromServer } from './code';

// "The spill", the app's error page (public/demo/mockups-error-pages.html, direction C): ink on the page, the viewer's
// own animal in the middle of it, and one dark plate that says what happened and where to go. Pressing the page
// spills more. A page that broke shows a code, and its blot is drawn from that code, so no two errors look alike.
// It draws its own small bar and not the app's: the page that broke may be the reason the bar cannot be drawn. The foot,
// which needs nothing from the server, is the app's own.

type Round = readonly [x: number, y: number, r: number];
type More = { key: number; x: number; y: number; size: number; seed: string; plain: boolean };
/** How many extra spills stay on the page; an older one goes as a new one lands. */
const MOST = 14;

/** One blot, landing. `plain` is a single dark shape; `third` puts the bright third ink in it and in its thrown drops. */
function Blot({ seed, plain, third }: { seed: string; plain?: boolean; third?: boolean }) {
  const blot = inkBlot(seed);
  const drops = (rounds: Round[], cls: string) => rounds.map(([x, y, r], n) => <circle key={`${cls}${n}`} className={`sp-fly ${cls}`} style={{ '--n': n, '--dx': `${-x * .7}px`, '--dy': `${-y * .7}px` } as CSSProperties} cx={x} cy={y} r={r * 1.3} />);
  return <svg viewBox="-80 -80 160 160" aria-hidden="true">
    <g className="sp-land">{!plain && <><path className="sp-school" d={blot.school} /><path className="sp-seep" d={blot.seep} /></>}<path className="sp-dark" d={blot.dark} />{third && <circle className="sp-third" cx={40} cy={-38} r={6} />}</g>
    {!plain && drops(blot.schoolDrops, third ? 'sp-third' : 'sp-school')}{drops(blot.darkDrops, 'sp-dark')}
  </svg>;
}

export function Spill({ kind, error, retry }: { /** `lost`: no page at this address. `broke`: a page failed. */ kind: 'lost' | 'broke'; error?: unknown; retry?: () => void }) {
  const broke = kind === 'broke', path = usePathname() ?? '/', me = useMe(), code = broke ? errorCode(error) : null;
  const [more, setMore] = useState<More[]>([]), [copied, setCopied] = useState(false), told = useRef<string | null>(null), next = useRef(0);
  // A fresh load of this page has no colours on yet: the person's own pick, if they made one.
  useEffect(() => { if (!document.documentElement.dataset.kit) { const picked = pickedKit(); if (picked) showKit(picked); } }, []);
  // Each error is told to the server once: the code, the page and the message go to its log (app/api/errors).
  useEffect(() => {
    if (!code || told.current === code) return;
    told.current = code;
    console.error(error);
    void fetch('/api/errors', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, path, message: error instanceof Error ? error.message : String(error), server: fromServer(error) }) }).catch(() => {});
  }, [code, error, path]);

  const spill = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as Element).closest('.sp-say, .sp-bar')) return;
    const box = event.currentTarget.getBoundingClientRect(), key = next.current++;
    setMore(all => [...all.slice(-(MOST - 1)), { key, x: event.clientX - box.left, y: event.clientY - box.top, size: 70 + Math.random() * 80, seed: `${path} ${key} ${Math.random()}`, plain: Math.random() < .35 }]);
  };
  const copy = () => { void navigator.clipboard?.writeText(code!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {}); };

  return <div className="cs sp">
    <header className="cs-nav sp-bar"><Link className="cs-wm" href="/"><Rings />Loopd</Link></header>
    <main className="sp-stage" onPointerDown={spill}>
      {more.map(each => <span key={each.key} className="sp-more" style={{ left: each.x, top: each.y, width: each.size } as CSSProperties}><Blot seed={each.seed} plain={each.plain} /></span>)}
      <div className="sp-blot"><Blot seed={code ?? path} third={broke} />
        {/* eslint-disable-next-line @next/next/no-img-element -- the person's own face, as everywhere else */}
        <img src={me.face} alt="" /></div>
      <div className="sp-say">
        <h1>{broke ? <>We spilled <em>something.</em></> : <>Nothing here <em>but ink.</em></>}</h1>
        <p className="cs-sr" role={broke ? 'alert' : undefined}>{broke ? 'This page broke on our side, not yours. The code below tells us which error it was.' : 'There is no page at this address.'}</p>
        <div className="sp-acts">
          {broke && retry && <button type="button" className="cs-btn go" onClick={() => retry()}>Try again</button>}
          <Link className={`cs-btn${broke ? '' : ' go'}`} href="/">This week</Link>
          {!broke && <Link className="cs-btn" href="/groups">Your groups</Link>}
          {code && <button type="button" className="cs-btn sp-code" onClick={copy}>Code {code}<b aria-live="polite">{copied ? 'Copied' : 'Copy'}</b></button>}
        </div>
        <span className="sp-hint" aria-hidden="true">{broke ? 'This blot is drawn from the code' : 'Press the page to spill more'}</span>
      </div>
    </main>
    <SiteFoot />
  </div>;
}
