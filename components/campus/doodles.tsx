'use client';

import { useSyncExternalStore } from 'react';
import { animal } from '@/lib/campus/animals';
import type { Doodle } from '@/lib/campus/doodles';

/* eslint-disable @next/next/no-img-element -- icons from public/animals */
const face = (n: number, index: number, className?: string, left?: number) => <img key={`${n}-${index}`} className={className} style={{ '--i': index, left: left === undefined ? undefined : `${left}%` } as React.CSSProperties} src={animal(n)} alt="" />;

/** What each one looks like, small and moving: drawn in CSS, so the page loads no game to show one. */
const PICTURE: Record<Doodle['slug'], () => React.ReactNode> = {
  conga: () => <div className="cs-dd-pv conga" aria-hidden="true">{[11, 4, 7, 16, 22, 2, 29].map((n, index) => face(n, index))}</div>,
  seats: () => <div className="cs-dd-pv seats" aria-hidden="true">
    {[20, 36, 52, 68, 84].map((left, index) => <i key={left} className={index < 2 ? 'in' : undefined} style={{ left: `${left}%` }} />)}
    {face(9, 0, 'in', 20)}{face(25, 1, 'in', 36)}{face(2, 0, undefined, 28)}{face(15, 1, undefined, 50)}{face(21, 2, undefined, 74)}</div>,
};

const never = () => () => {};
/** The best the game has kept in this browser. Nothing until a first game, and nothing on the server. */
function Best({ at }: { at: string }) {
  const best = useSyncExternalStore(never, () => { try { return localStorage.getItem(at); } catch { return null; } }, () => null);
  return best ? <b>Your best: {best}</b> : null;
}

/**
 * The doodles as tickets on a rail (direction A of public/demo/mockups-games-shelf.html): the game moving on the face, its
 * name on an ink plate thrown across it, and Play on the stub. A staged one is greyed, says so, and can be tried.
 */
export function DoodleShelf({ doodles }: { doodles: Doodle[] }) {
  return <ul className="cs-dd-rail">{doodles.map(each => <li key={each.slug} className={each.live ? 'cs-dd' : 'cs-dd staged'}>
    <span className={each.live ? 'cs-dd-tag' : 'cs-dd-tag wait'}>{each.live ? 'Out now' : 'Staged: only you see this'}</span>
    <div className="cs-dd-main">{PICTURE[each.slug]()}<h2>{each.name}</h2><p>{each.line}</p></div>
    <div className="cs-dd-stub">
      {/* A game is a plain page of its own, so an ordinary link. */}
      <a className={each.live ? 'cs-dd-go' : 'cs-dd-go try'} href={each.href} aria-label={`${each.live ? 'Play' : 'Try'} ${each.name}`}>{each.live ? 'Play' : 'Try'}</a>
      {each.bestKey && <Best at={each.bestKey} />}</div>
  </li>)}</ul>;
}
