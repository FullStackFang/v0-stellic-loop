'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { animal } from '@/lib/campus/animals';
import { course, type Doodle } from '@/lib/campus/doodles';

/* eslint-disable @next/next/no-img-element -- icons from public/animals */
const face = (n: number, key: number | string, style?: React.CSSProperties) => <img key={key} style={style} src={animal(n)} alt="" />;

const Go = ({ href, ...rest }: { href: string; className: string; 'aria-label': string; children: React.ReactNode }) => href.startsWith('/c/') ? <Link href={href} {...rest} /> : <a href={href} {...rest} />;

/** Where Conga's line stands on its picture, along the path round the grounds, in percent. The first is the leader. */
const LINE = [[64, 58], [56, 62], [48, 63], [40, 61], [33, 56], [28, 49], [26, 41]] as const;
/** Where the pins stand, in percent. */
const PINS = [[18, 26], [58, 16], [82, 74]] as const;
/** The chart of Seats, as one look shows it: some tiles turned up, the rest face down. */
const CHART = [9, null, 25, 2, null, 15, 9, null, null, 21, 2, null] as const;

/** What each one looks like: a still, drawn in CSS, so the page loads no game to show one. */
function Picture({ slug, places }: { slug: Doodle['slug']; places: readonly string[] }) {
  if (slug === 'conga') return <div className="cs-dd-pv conga" aria-hidden="true"><i className="ground" />
    {places.map((place, at) => <span key={place} className="pin" style={{ left: `${PINS[at][0]}%`, top: `${PINS[at][1]}%` }}>{place}</span>)}
    {[11, 4, 7, 16, 22, 2, 29].map((n, at) => face(n, at, { left: `${LINE[at][0]}%`, top: `${LINE[at][1]}%` }))}</div>;
  return <div className="cs-dd-pv seats" aria-hidden="true">{CHART.map((n, at) => <i key={at} className={n === null ? 'down' : undefined}>{n !== null && face(n, at)}</i>)}</div>;
}

const never = () => () => {};
/** The best the game has kept in this browser. Nothing until a first game, and nothing on the server. */
const useBest = (at: string | undefined) => useSyncExternalStore(never, () => { try { return at ? localStorage.getItem(at) : null; } catch { return null; } }, () => null);

/**
 * The doodles as courses (direction B of public/demo/mockups-doodles-campus.html): a ticket each, its course code on the
 * picture, the name on an ink plate thrown across it, three things you will learn, and the stub with Enrol. Once the
 * browser has kept a best, a Passed stamp lands on the ticket. A staged one is greyed, says so, and can be tried.
 */
export function DoodleShelf({ doodles, campus }: { doodles: Doodle[]; campus: { slug: string; name: string } }) {
  return <ul className="cs-dd-rail">{doodles.map(each => <Ticket key={each.slug} doodle={each} campus={campus} />)}</ul>;
}

function Ticket({ doodle, campus }: { doodle: Doodle; campus: { slug: string; name: string } }) {
  const best = useBest(doodle.bestKey)?.split(',')[0], { code, line, learn, href, places } = course(doodle, campus);
  return <li className={doodle.live ? 'cs-dd' : 'cs-dd staged'}>
    <span className={!doodle.live ? 'cs-dd-tag wait' : doodle.works ? 'cs-dd-tag works' : 'cs-dd-tag'}>{!doodle.live ? 'Staged: only you see this' : doodle.works ? 'In the works' : 'Out now'}</span>
    <div className="cs-dd-main">
      <span className="cs-dd-code">{code}</span>
      <Picture slug={doodle.slug} places={places} />
      <h2>{doodle.name}</h2>
      <p>{line}</p>
      <div className="cs-dd-learn"><b>You will learn</b><ul>{learn.map(each => <li key={each}>{each}</li>)}</ul></div>
    </div>
    <div className="cs-dd-stub">
      <dl><div><dt>Credits</dt><dd>0</dd></div>{best && <div><dt>Your best</dt><dd>{best}</dd></div>}</dl>
      {/* A game that is a page of the app is moved to as any page is, so the bar stays and the loader stands under it. A plain page of its own (Conga) is an ordinary link. */}
      <Go href={href} className={doodle.live ? 'cs-dd-go' : 'cs-dd-go try'} aria-label={`${doodle.live ? 'Enrol in' : 'Try'} ${doodle.name}`}>{doodle.live ? 'Enrol' : 'Try'}</Go>
    </div>
    {best && <span className="cs-dd-stamp" aria-hidden="true"><small>Passed</small><b>{best}</b></span>}
  </li>;
}
