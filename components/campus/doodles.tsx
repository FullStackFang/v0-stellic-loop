'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { playAt, type Doodle } from '@/lib/campus/doodles';

/**
 * What a game looks like: a few silent seconds recorded from a real game (public/doodles). Its first frame shows at once, as
 * a small picture; the recording is fetched only once the tile is on screen, plays while it stays there, and stops when it
 * leaves. Someone who asked for less motion, or to save data, keeps the picture.
 */
function Clip({ doodle }: { doodle: Doodle }) {
  const clip = useRef<HTMLVideoElement>(null), at = `/doodles/${doodle.slug}.v1`;
  useEffect(() => {
    const el = clip.current!;
    if (!window.IntersectionObserver || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || (navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
    const watch = new IntersectionObserver(([seen]) => { if (seen.isIntersecting) el.play().catch(() => {}); else el.pause(); }, { threshold: 0.4 });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return <video ref={clip} className="cs-dd-pv" muted loop playsInline preload="none" poster={`${at}.webp`} src={`${at}.mp4`} width={doodle.shot[0]} height={doodle.shot[1]} aria-label={doodle.line} />;
}

/**
 * The doodles (direction B of public/demo/mockups-doodles-shots.html): a tile each, holding the game being played, its name on
 * an ink plate thrown across the picture, and Play. Nothing else. The tiles share the row by the shape of their pictures, so
 * the pictures stand at one height. A staged one is greyed, says so, and can be tried.
 */
export function DoodleShelf({ doodles, campus }: { doodles: Doodle[]; campus: { slug: string; name: string } }) {
  return <ul className="cs-dd-rail">{doodles.map(each => <Tile key={each.slug} doodle={each} campus={campus} />)}</ul>;
}

function Tile({ doodle, campus }: { doodle: Doodle; campus: { slug: string } }) {
  const shape = doodle.shot[0] / doodle.shot[1];
  return <li className={`cs-dd${doodle.live ? '' : ' staged'}${shape < 1 ? ' tall' : ''}`} style={{ '--shape': shape } as React.CSSProperties}>
    {!doodle.live ? <span className="cs-dd-tag wait">Staged: only you see this</span> : doodle.works && <span className="cs-dd-tag">In the works</span>}
    <Clip doodle={doodle} />
    <div className="cs-dd-foot">
      <h2>{doodle.name}</h2>
      {/* Every game is a page of the app, moved to as any page is, so the bar stays and the loader stands under it. */}
      <Link href={playAt(doodle, campus)} className={doodle.live ? 'cs-dd-go' : 'cs-dd-go try'} aria-label={`${doodle.live ? 'Play' : 'Try'} ${doodle.name}`}>{doodle.live ? 'Play' : 'Try'}</Link>
    </div>
  </li>;
}
