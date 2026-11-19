'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { changeCampusAction, checkInAction, faceAction, imInAction, inviteAction, joinAction, leaveAction, ownFaceAction, useCouponAction as markCouponUsed, useRewardAction as markRewardUsed, type ActResult } from '@/app/c/actions';
import { Rings } from '@/components/LoopGlyphs';
import { animal, CUSTOM, NAMES, PHOTO } from '@/lib/campus/animals';
import { LEVELS } from '@/lib/campus/levels';
import { KITS, kitNow, pickKit } from './kit';
import { meant, pick, type Findable } from '@/lib/campus/search';
import { landOf, sectionAt, walkMinutes, type Point } from '@/lib/campus/sections';
import type { SwapCampus } from './swap';
import { Composer, type Soon } from './composer';
import { Near } from './near';
import { OwnFace } from './own-face';
import { InkBlot, InkMark, SchoolMark } from './ink-mark';
import { INK_PAGE } from '@/lib/campus/ink';
import type { Coupon, Face, Screen, Seat, Ticket, Tile as Pet } from '@/lib/campus/view';

// The campus screen, "This week" (design D16): one line of top bar, the search line, the count line, a sideways row of
// tickets whose details unfold beside them, and the rewards a person is earning. Ported from screen 1 of
// public/demo/mockups-campus-usecases.html. Everything it shows of other people was decided on the server (lib/campus/screen.ts).

const SAY = ['exercise', 'eat with people', 'study', 'startups', 'tonight'];
/** Places plans will also be listed from. Named beside the sources that work, and not pressable. */
const SOON = ['Luma', 'Posh'];
// A window this wide has room for the map beside the week (public/demo/mockups-campus-desktop.html). Narrower, the map is the "Near you" view.
const WIDE = '(min-width: 1100px)';
const wideNow = () => typeof matchMedia === 'function' && matchMedia(WIDE).matches;
const onWide = (changed: () => void) => { if (typeof matchMedia !== 'function') return () => {}; const query = matchMedia(WIDE); query.addEventListener('change', changed); return () => query.removeEventListener('change', changed); };
/** Runs a change as one move, where the browser can: each ticket travels to where it lands instead of the list being redrawn. */
function glide(change: () => void) {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still || typeof document.startViewTransition !== 'function') change(); else document.startViewTransition(() => flushSync(change));
}
const Pin = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.800 8 14 8 14z" /><circle cx={8} cy={6.5} r={1.5} /></svg>;
const Chevron = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" /></svg>;

export function FaceDot({ face, className = '' }: { face: Face; className?: string }) {
  const cls = `cs-face ${face.photo?.startsWith('/animals/') ? 'pet' : ''} ${face.here ? 'here' : ''} ${className}`.replace(/\s+/g, ' ').trim(), who = face.me ? 'You' : face.first;
  // Someone who has Ink sits on a blot of their own, not a plain circle, and the name says so.
  const name = face.ink ? `${who}, ${face.me ? 'you have' : 'has'} Ink` : who;
  // eslint-disable-next-line @next/next/no-img-element -- an icon from public/animals, or the sign-in account's photo at its own address
  const dot = face.photo ? <img className={cls} src={face.photo} alt={name} title={name} /> : <i className={cls} role="img" aria-label={name} title={name}>{who.slice(0, 1).toUpperCase()}</i>;
  return face.ink ? <span className="cs-inked"><InkBlot seed={`${face.first}${face.photo ?? ''}`} />{dot}</span> : dot;
}
const Stack = ({ faces }: { faces: Face[] }) => faces.length ? <span className="cs-stack">{faces.slice(0, 6).map((face, at) => <FaceDot key={at} face={face} />)}</span> : null;
export const Tile = ({ top, big, met = false }: { top: string; big: string; met?: boolean }) => <span className={`cs-tile ${met ? 'met' : ''}`}><small>{top}</small><b>{big}</b></span>;
/** One wedge per step needed; a wedge lights for each step done. */
function Gauge({ have, need }: { have: number; need: number }) {
  const around = 2 * Math.PI * 12, part = around / need, gap = need > 1 ? 2.2 : 0;
  return <svg className="cs-gauge" viewBox="0 0 30 30" aria-hidden="true">{Array.from({ length: need }, (_, at) => <circle key={at} className={at < have ? 'lit' : ''} cx={15} cy={15} r={12} strokeDasharray={`${part - gap} ${around - part + gap}`} strokeDashoffset={-at * part} />)}</svg>;
}
/** The time now, to the second, for showing a reward at the counter. Empty until the page is in the browser. */
function Clock() {
  const [now, setNow] = useState('');
  useEffect(() => { const tick = () => setNow(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })); tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer); }, []);
  return <time>{now}</time>;
}

function Seats({ seats }: { seats: Seat[] }) {
  const firstEmpty = seats.findIndex(seat => !seat.taken);
  return <span className="cs-seats">{seats.map((seat, at) => seat.face ? <FaceDot key={at} face={seat.face} />
    : <i key={at} className={`cs-seat ${seat.taken ? 'taken' : ''} ${seat.here ? 'here' : ''} ${at === firstEmpty ? 'next' : ''}`} role="img" aria-label={seat.taken ? 'A seat someone has taken' : seat.yours ? 'An empty seat, yours if you join' : 'An empty seat'} />)}</span>;
}

type Pane = 'more' | 'invite';
export type ScreenProps = { screen: Screen; signInHref: string; openId?: string | null; signOut?: ReactNode; /** The "On you" counter (openspec loop-on-you), read on the server beside the week. */ onYou?: ReactNode; /** The campuses of this school, when it has more than one. */ swap?: SwapCampus[] };

export function CampusScreen({ screen, signInHref, openId = null, signOut = null, onYou = null, swap }: ScreenProps) {
  const { campus, viewer, tickets, earning, live } = screen;
  const [typed, setTyped] = useState(''), [view, setView] = useState<'best' | 'all' | 'near'>('best');
  const [open, setOpen] = useState<{ id: string; pane: Pane; fresh: boolean } | null>(openId ? { id: openId, pane: 'more', fresh: false } : null);
  const [entering, setEntering] = useState(false), [message, setMessage] = useState(''), [copied, setCopied] = useState(false), [showing, setShowing] = useState<string | null>(null);
  const [busy, start] = useTransition(), [posting, setPosting] = useState(false);
  const rail = useRef<HTMLDivElement>(null), [ends, setEnds] = useState({ left: true, right: true });

  // "Near you" is the week on a map (components/campus/near.tsx), for a campus whose sections are drawn. It searches as "Best for you" does.
  const land = useMemo(() => landOf(campus.slug), [campus.slug]);
  // On a wide window the map is always there, beside the week, so "Near you" is not a view of its own.
  const wide = useSyncExternalStore(onWide, wideNow, () => false) && !!land, near = !wide && view === 'near' && !!land;
  // Wide: the ticket that is on, on the map and in the list. Not chosen yet, or no longer in the list, it is the first one with a spot; `null` is "none", by choice.
  const [sel, setSel] = useState<string | null | undefined>(undefined), [hot, setHot] = useState<string | null>(null), [you, setYou] = useState<Point | null>(null);
  const srcs = useRef<HTMLDivElement>(null);
  const picked = useMemo(() => pick(tickets.map((ticket): Findable => ({ id: ticket.id, title: ticket.title, host: ticket.by, place: ticket.place, source: ticket.source, words: ticket.words, pull: ticket.pull })), typed, view === 'all' ? 'all' : 'best', campus.listSource), [tickets, typed, view, campus.listSource]);
  const byId = useMemo(() => new Map(tickets.map(ticket => [ticket.id, ticket])), [tickets]);
  const shown = [...picked.best, ...picked.rest], opened = open && shown.includes(open.id) ? byId.get(open.id) ?? null : null;
  const onMap = useMemo(() => { const left = new Set([...picked.best, ...picked.rest]); return tickets.filter(ticket => ticket.map && left.has(ticket.id)); }, [tickets, picked]);
  /** Whether a spot lies in one of the campus's sections. A plan at a place off the map is shown at that place alone, and only when it is picked. */
  const drawn = (spot: { lon: number; lat: number } | null | undefined) => !!spot && !!land && !!sectionAt(land, [spot.lon, spot.lat]);
  const lit = !wide || sel === null ? null : sel && shown.includes(sel) ? sel : shown.find(id => drawn(byId.get(id)?.map)) ?? null;
  // The ink thumb of the sources sits under the one that is on.
  useLayoutEffect(() => {
    const bar = srcs.current;
    if (!bar) return;
    const put = () => { const on = bar.querySelector<HTMLElement>('[aria-pressed=true]'); if (on) { bar.style.setProperty('--x', `${on.offsetLeft}px`); bar.style.setProperty('--w', `${on.offsetWidth}px`); } };
    put(); addEventListener('resize', put); document.fonts?.ready.then(put);
    return () => removeEventListener('resize', put);
  }, [wide, view]);

  const measure = () => { const row = rail.current; if (row) setEnds({ left: row.scrollLeft < 8, right: row.scrollLeft > row.scrollWidth - row.clientWidth - 8 }); };
  useEffect(() => { measure(); addEventListener('resize', measure); return () => removeEventListener('resize', measure); }, [shown.length, opened?.id]);
  // A ticket that was just opened is brought to the left edge, so its panel has the room.
  useEffect(() => {
    const row = rail.current, card = open?.fresh ? row?.querySelector<HTMLElement>('.cs-ev.open') : null;
    // Wide: the list runs down, and the panel opens under its ticket.
    if (row && card && wide) (row.querySelector('.cs-sheet') ?? card).scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    else if (row && card) row.scrollTo?.({ left: row.scrollLeft + card.getBoundingClientRect().left - row.getBoundingClientRect().left - 6, behavior: 'smooth' });
  }, [open, wide]);

  // Plans that carry a tag, for the posting panel: a person typing that tag can look at one, and join it instead.
  const soon = useMemo(() => tickets.filter(ticket => ticket.tags.length).map((ticket): Soon => ({ id: ticket.id, tags: ticket.tags, title: ticket.title, day: ticket.day, time: ticket.time, mine: !!ticket.mine,
    who: ticket.known.length ? `${ticket.known[0].first}${ticket.going > 1 ? ` and ${ticket.going - 1} ${ticket.going === 2 ? 'other' : 'others'}` : ''}` : `${ticket.going} going` })), [tickets]);
  /** The "+" opens the posting panel at the start of the row, and closes it. */
  const togglePost = () => { setOpen(null); setMessage(''); setPosting(now => !now); rail.current?.scrollTo?.({ left: 0, behavior: 'smooth' }); };

  const show = (id: string, pane: Pane) => { setCopied(false); setPosting(false); setOpen(now => now?.id === id && now.pane === pane ? null : { id, pane, fresh: true }); };
  const search = (next: string) => { setTyped(next); setOpen(null); setEntering(true); rail.current?.scrollTo?.({ left: 0, top: 0 }); };
  /** Wide: a stamp pressed on the map picks its ticket, and the list brings that ticket into view. */
  const pickOnMap = (id: string | null) => { setSel(id); if (id) requestAnimationFrame(() => rail.current?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })); };
  /** Runs an action; a signed-out caller is sent to sign in and back. */
  const run = (action: () => Promise<ActResult>, after?: () => void) => start(async () => {
    setMessage('');
    const result = await action();
    if (result.ok) after?.(); else if (result.signIn) location.assign(signInHref); else setMessage(result.message);
  });

  const action = (ticket: Ticket) => {
    if (!viewer) return ticket.action ? <Link className="cs-btn sm go" href={signInHref}>{ticket.action === 'register' ? 'Register' : ticket.action === 'join' ? 'Join' : "I'm in"}</Link> : null;
    switch (ticket.action) {
      case 'in': return <button className="cs-btn sm go" disabled={busy} onClick={() => run(() => imInAction(ticket.id), () => setOpen({ id: ticket.id, pane: 'invite', fresh: true }))}>I&rsquo;m in</button>;
      case 'join': return <button className="cs-btn sm go" disabled={busy} onClick={() => run(() => joinAction(ticket.joinToken!))}>Join</button>;
      case 'register': return <button className="cs-btn sm go" onClick={() => setOpen({ id: ticket.id, pane: 'more', fresh: open?.id !== ticket.id })}>Register</button>;
      case 'checkin': return <button className="cs-btn sm go" disabled={busy} onClick={() => run(() => checkInAction(ticket.id))}>Check in</button>;
      case 'use': return <button className="cs-btn sm go" disabled={busy} onClick={() => run(() => markRewardUsed(ticket.id))}>Mark as used</button>;
      default: return ticket.status ? <span className={`cs-pill ${ticket.status.startsWith('Used') ? 'yes' : 'hot'}`}>{ticket.status}</span> : null;
    }
  };

  const stub = (ticket: Ticket) => {
    const { stub: deal } = ticket, inviting = open?.id === ticket.id && open.pane === 'invite';
    const act = <span className="cs-act">{viewer && ticket.mine && !ticket.status?.startsWith('Used') && <button className="cs-btn sm" aria-expanded={inviting} onClick={() => show(ticket.id, 'invite')}>{inviting ? 'Close' : 'Invite'}</button>}{action(ticket)}</span>;
    if (deal.kind === 'group') return <div className={`cs-mech ${deal.state === 'met' ? 'met' : deal.state === 'near' ? 'near' : ''}`}><Seats seats={deal.seats} /><div className="cs-what"><small>Group reward from {deal.giver}</small><b>{deal.text}</b><span>Group of {deal.need} · {deal.say}</span></div>{act}</div>;
    if (deal.kind === 'building') return <div className="cs-mech"><span className="cs-pips" role="img" aria-label={`${deal.done} of ${deal.need}`}>{Array.from({ length: deal.need }, (_, at) => <i key={at} className={at < deal.done ? 'lit' : at === deal.done ? 'next' : ''} />)}</span><div className="cs-what"><small>Builds with activity, from {deal.giver}</small><b>{deal.text}</b><span>{deal.say}</span></div><Stack faces={deal.faces} />{act}</div>;
    return <div className="cs-mech none"><Stack faces={deal.faces} /><div className="cs-what"><span>{deal.say}</span></div>{act}</div>;
  };

  const card = (ticket: Ticket, at: number) => {
    const isOpen = opened?.id === ticket.id, details = isOpen && open!.pane === 'more';
    const spot: Point | null = wide && ticket.map ? [ticket.map.lon, ticket.map.lat] : null;
    return <article key={ticket.id} data-id={ticket.id} className={`cs-ev ${isOpen ? 'open' : ''} ${lit === ticket.id ? 'sel' : ''} ${wide && hot === ticket.id ? 'hov' : ''}`} style={{ '--i': at, ...(wide && { viewTransitionName: `ev-${ticket.id.replace(/[^a-zA-Z0-9_-]/g, '')}` }) } as React.CSSProperties}
      onMouseEnter={wide ? () => setHot(ticket.id) : undefined} onMouseLeave={wide ? () => setHot(null) : undefined}
      onClick={event => { if ((event.target as HTMLElement).closest('button, a, input')) return; if (wide) setSel(ticket.id); else show(ticket.id, 'more'); }}>
      <div className="cs-top"><Tile top={ticket.day} big={ticket.time} met={ticket.stub.kind === 'group' && ticket.stub.state === 'met'} />
        <div className="cs-body"><h3>{ticket.title}</h3><p>{ticket.source && <span className="cs-pill src">{ticket.source}</span>}{ticket.tags.map(tag => <b key={tag} className="cs-at">@{tag}</b>)}{[ticket.by, ticket.place].filter(Boolean).join(' · ')}</p></div>
        {spot && <span className="cs-walk"><Pin />{!drawn(ticket.map) ? 'Off the map' : you ? `${walkMinutes(you, spot)} min walk` : 'On the map'}</span>}
        <button className="cs-more" aria-expanded={details} aria-label={details ? 'Close' : 'Details'} onClick={() => { if (wide) setSel(ticket.id); show(ticket.id, 'more'); }}><span>{details ? 'Close' : 'Details'}</span><Chevron /></button></div>
      {stub(ticket)}
    </article>;
  };

  const more = (ticket: Ticket) => {
    const map = near || wide ? null : ticket.map, box = map && [map.lon - .0062, map.lat - .0026, map.lon + .0062, map.lat + .0026].map(n => n.toFixed(4)).join('%2C');
    const people = ticket.mine ? ticket.mine.members.filter(face => !face.me).map(face => ({ ...face, why: face.here ? 'Checked in' : 'In your group' })) : ticket.known;
    return <div className={`cs-regp ${map ? '' : 'wide'}`}><div className="cs-regd">
      {ticket.about && <p>{ticket.about}</p>}
      {ticket.how && <p className="how"><b>How it unlocks</b>{ticket.how}</p>}
      <ul className="cs-facts"><li><b>{ticket.day}, {ticket.time}</b>{ticket.ends ?? 'No end time given'}</li>
        {ticket.by && <li><b>{ticket.by}</b>{ticket.source ? `Listed on ${ticket.source}` : ticket.going ? `${ticket.going} going` : 'Nobody is in yet'}</li>}
        {!map && ticket.place && <li><b>{ticket.place}</b>Where</li>}
        {ticket.link && <li><b><a href={ticket.link} target="_blank" rel="noopener noreferrer nofollow">{ticket.link.slice('https://'.length).split('/')[0]}</a></b>Event page</li>}
        {people.map((face, at) => <li className="who" key={at}><FaceDot face={face} /><span><b>{face.first}</b>{face.why}</span></li>)}</ul></div>
      {map && <figure className="cs-map"><iframe title={`Map of ${map.name}`} loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${box}&layer=mapnik&marker=${map.lat}%2C${map.lon}`} /><figcaption><b>{map.name}</b>{ticket.place !== map.name ? ticket.place : ''}</figcaption></figure>}
      <div className="cs-regact">{ticket.mine ? <>
          <small>{ticket.mine.registered ? 'You are registered, in Loop. ' : 'You are in. '}A reward only unlocks for people who check in together, so bring them.{' '}
            {ticket.mine.canEdit && <Link className="quiet" href={`/c/${campus.slug}/post?plan=${ticket.id}`}>Change this plan</Link>}{' '}
            {ticket.mine.canLeave && <button className="quiet" disabled={busy} onClick={() => run(() => leaveAction(ticket.id))}>Leave</button>}</small>
          <button className="cs-btn go" onClick={() => show(ticket.id, 'invite')}>Invite people</button></>
        : ticket.action === 'register' ? <><small>Loop keeps your registration here, so the people you know can see you are going. {ticket.source ?? 'The organizer'} is not told: if the event asks you to register with them, do that too.</small>
          {viewer ? <button className="cs-btn go" disabled={busy} onClick={() => run(() => imInAction(ticket.id), () => setOpen({ id: ticket.id, pane: 'invite', fresh: false }))}>Register me</button> : <Link className="cs-btn go" href={signInHref}>Register me</Link>}</>
        : ticket.action === 'join' ? <><small>You were sent a link to a group going to this.</small>{action(ticket)}</> : null}</div></div>;
  };

  const invite = (ticket: Ticket) => {
    const mine = ticket.mine!, link = typeof location === 'undefined' ? `/o/${mine.token}` : `${location.host}/o/${mine.token}`;
    return <><div className="cs-opts"><small>{mine.choices.length ? 'People you know' : 'Nobody you know is left to invite. Send the link.'}</small>
        {mine.choices.map(choice => <button key={choice.personId} className="cs-who2" aria-pressed={choice.invited} disabled={busy} onClick={() => run(() => inviteAction(ticket.id, choice.personId, !choice.invited))}>
          <FaceDot face={choice} /><span><b>{choice.first}</b>{choice.why}</span><em>{choice.invited ? 'Invited' : 'Invite'}</em></button>)}</div>
      <div className="cs-opts"><small>Or send a link. Anyone can also just show up with you and check in.</small><span className="cs-field">{link}</span>
        <button className="cs-opt" onClick={() => { navigator.clipboard?.writeText(new URL(`/o/${mine.token}`, location.origin).href).then(() => setCopied(true), () => setMessage('Copy the link from the box.')); }}>{copied ? 'Copied' : 'Copy link'}</button></div></>;
  };

  const sheet = opened && <div key="sheet" className={`cs-sheet ${open!.fresh ? 'fresh' : ''}`}>
    <div className="cs-sheet-top"><h3>{opened.title}</h3><button className="cs-more" aria-expanded="true" onClick={() => setOpen(null)}>Close<Chevron /></button></div>
    {open!.pane === 'invite' && opened.mine ? invite(opened) : more(opened)}</div>;
  const postSheet = posting && viewer && <div key="post" className="cs-sheet cs-post fresh">
    <div className="cs-sheet-top"><h3>Start something</h3><button className="cs-more" aria-expanded="true" onClick={() => setPosting(false)}>Close<Chevron /></button></div>
    <Composer campus={campus} tags={screen.places} soon={soon} onDone={() => setPosting(false)} onReview={id => { setTyped(''); if (wide) setSel(id); show(id, 'more'); }} /></div>;
  const nothing = <div className="cs-nothing"><div className="cs-nothing-top"><Tile top="This week" big="Open" /><div><h3>{typed.trim() ? 'Nothing matches' : 'Nothing here yet'}</h3><p>{typed.trim() ? 'Try another word, or post a plan of your own.' : 'Post a plan of your own and it shows here at once.'}</p></div></div>
    <div className="cs-nothing-stub"><small>Yours could be the first this week.</small></div></div>;
  const plus = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15" /></svg>;
  const row = (id: string, at: number) => { const ticket = byId.get(id)!; return [card(ticket, at), opened?.id === id ? sheet : null]; };
  const [count, ...words] = (picked.marker ?? '').split(' ');
  // Only an event at a place Loop knows has a spot on the map, and the line says how many do.
  const nearLine = meant(typed).length ? `${onMap.length} on the map for “${typed.trim()}”` : !shown.length ? 'Nothing on this week yet' : onMap.length === shown.length ? `${onMap.length} on the map this week` : `${onMap.length} of ${shown.length} this week are on the map`;

  const bar = <CampusBar screen={screen} signInHref={signInHref} signOut={signOut} swap={swap}>
    {onYou}
    {live && (live.usedAt ? <div className="cs-live used"><small>{live.giver}</small><b>{byId.get(live.listingId)?.status ?? 'Used'}</b></div>
      : <div className="cs-live"><small>Show at the counter</small><b>{live.text}</b><Clock /><button disabled={busy} onClick={() => run(() => markRewardUsed(live.listingId))}>Mark as used</button></div>)}
  </CampusBar>;
  const ask = <input type="search" placeholder="What do you feel like doing?" aria-label="Say what you feel like doing" value={typed} onChange={event => search(event.target.value)} />;
  const post = viewer ? <button className="cs-plus" aria-label="Post a plan" aria-expanded={posting} onClick={togglePost}>{plus}</button> : <Link className="cs-plus" aria-label="Post a plan" href={signInHref}>{plus}</Link>;
  const shelf = earning.length > 0 && <div className="cs-shelf"><h2>Rewards you are earning</h2><ul className="cs-coupons">{earning.map(coupon => <CouponRow key={coupon.id} coupon={coupon} showing={showing === coupon.id} busy={busy}
    onShow={() => setShowing(now => now === coupon.id ? null : coupon.id)} onUse={() => run(() => markCouponUsed(coupon.id), () => setShowing(null))} />)}</ul></div>;

  // Wide: search and sources on one line across the page, then the week in a column of its own with the map beside it.
  // The words to try open under the search line, and the list is what turns the map.
  if (wide) return <div className="cs cs-wide">{bar}
    <main className="cs-main"><section className="cs-fill">
      <div className="cs-strip">
        <div className="cs-find">{ask}
          <div className="cs-try" role="group" aria-label="Words to try" onMouseDown={event => event.preventDefault()}><small>Try</small>{SAY.map(word => <button key={word} className="cs-opt" aria-pressed={typed === word}
            onClick={event => { glide(() => search(typed === word ? '' : word)); event.currentTarget.blur(); (document.activeElement as HTMLElement | null)?.blur?.(); }}>{word}</button>)}</div></div>
        <div className="cs-srcs" ref={srcs} role="group" aria-label="Where plans are listed from">
          {([['best', 'Best for you'], ['all', campus.listSource]] as const).map(([key, label]) => <button key={key} aria-pressed={(view === 'all' ? 'all' : 'best') === key} onClick={() => glide(() => { setView(key); setOpen(null); rail.current?.scrollTo?.({ top: 0 }); })}>{label}</button>)}
          {SOON.filter(name => name !== campus.listSource).map(name => <span key={name}>{name}<i>soon</i></span>)}</div>
      </div>
      {message && <p className="cs-alert" role="alert">{message}</p>}
      {postSheet && <div className="cs-wide-post">{postSheet}</div>}
      <div className="cs-split">
        <div className="cs-col">
          <div className="cs-tally">{post}<h2 aria-live="polite"><b>{picked.line}</b>{shown.length > 0 && <span>{onMap.length === shown.length ? 'All' : onMap.length} on the map</span>}</h2></div>
          <div className="cs-scroll" ref={rail}>
            <div className="cs-grid">{picked.nothing ? nothing : <>
              {picked.best.map(row)}
              {picked.rest.length > 0 && <div className="cs-then"><b>{count}</b><span>{words.join(' ')}</span></div>}
              {picked.rest.map((id, at) => row(id, picked.best.length + 1 + at))}</>}</div>
            {shelf}
          </div>
        </div>
        <Near beside swap={swap} land={land!} tickets={onMap} me={viewer && { first: viewer.first, photo: viewer.photo, ink: viewer.asked }} asked={meant(typed).length ? typed.trim() : ''} picked={lit} onPick={pickOnMap} hot={hot} onHover={setHot} onYou={setYou} />
      </div>
    </section></main>
  </div>;

  return <div className="cs">{bar}
    <main className="cs-main"><section className="cs-fill">
      <div className="cs-ask"><input type="search" placeholder="What do you feel like doing?" aria-label="Say what you feel like doing" value={typed} onChange={event => search(event.target.value)} /></div>
      {/* The count sits in a pill, and posting starts from the "+" at its left end: above the row, so it is there wherever the row is scrolled to (design D13). The filters sit on the same line, each a pill (loop-on-you, design D4). */}
      <div className="cs-count"><div className="cs-tally">
        {post}
        <h2 aria-live="polite">{near ? nearLine : picked.line}</h2></div>
        <div className="cs-tabs">{([['best', 'Best for you'], ['all', campus.listSource], ...(land ? [['near', 'Near you'] as const] : [])] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => { setView(key); setOpen(null); setEntering(true); }}>{label}</button>)}</div>
        <div className="cs-says"><small>Try</small>{SAY.map(word => <button key={word} className="cs-opt" aria-pressed={typed === word} onClick={() => search(typed === word ? '' : word)}>{word}</button>)}</div></div>
      {message && <p className="cs-alert" role="alert">{message}</p>}
      {near ? <>{postSheet && <div className="cs-railwrap cs-near-post"><div className="cs-rail">{postSheet}</div></div>}
        <Near swap={swap} land={land} tickets={onMap} me={viewer && { first: viewer.first, photo: viewer.photo, ink: viewer.asked }} asked={meant(typed).length ? typed.trim() : ''} picked={opened?.id ?? null} onPick={id => { setCopied(false); setPosting(false); setOpen(id ? { id, pane: 'more', fresh: true } : null); }}>
          {opened && <div className="cs-rail" ref={rail}>{card(opened, 0)}{sheet}</div>}</Near></>
      : <div className={`cs-evs ${entering ? 'in' : ''}`} key={entering ? `${typed}|${view}` : 'row'}>
        {picked.nothing ? postSheet ? <div className="cs-railwrap"><div className="cs-rail">{nothing}{postSheet}</div></div> : nothing
          : <div className="cs-railwrap"><div className="cs-rail" ref={rail} onScroll={measure}>
              {postSheet}
              {picked.best.map(row)}
              {picked.rest.length > 0 && <div className="cs-then" style={{ '--i': picked.best.length } as React.CSSProperties}><b>{count}</b><span>{words.join(' ')}</span></div>}
              {picked.rest.map((id, at) => row(id, picked.best.length + 1 + at))}</div>
            <button className="cs-rgo l" hidden={ends.left} aria-label="Earlier events" onClick={() => rail.current?.scrollBy({ left: -604, behavior: 'smooth' })}><Chevron /></button>
            <button className="cs-rgo r" hidden={ends.right} aria-label="More events" onClick={() => rail.current?.scrollBy({ left: 604, behavior: 'smooth' })}><Chevron /></button></div>}
      </div>}
      {shelf}
    </section></main>
  </div>;
}

/**
 * The top bar, one line. "This week" and the Ink page (app/c/ink) both draw this one, so it is the same on both: `on`
 * is which of the two it is on, and `children` is what a page puts before the avatar.
 */
export function CampusBar({ screen, signInHref, signOut = null, on = 'week', swap, children }: { screen: Screen; signInHref: string; signOut?: ReactNode; on?: 'week' | 'ink'; swap?: SwapCampus[]; children?: ReactNode }) {
  const { campus, viewer } = screen;
  return <header className="cs-nav">
    <Link className="cs-wm" href={`/c/${campus.slug}`}><Rings />Loop</Link>
    <nav className="cs-links" aria-label={campus.name}><Link href={`/c/${campus.slug}`} aria-current={on === 'week' ? 'page' : undefined}>This week</Link>
      {viewer?.groups.map(group => <Link key={group.href} href={group.href}><i>{group.name.slice(0, 1).toUpperCase()}</i>{group.name}</Link>)}
      <Link className="cs-inktab" href={INK_PAGE} aria-label="Ink" aria-current={on === 'ink' ? 'page' : undefined}><InkMark /><span>Ink</span></Link></nav>
    <div className="cs-nav-end">
      {children}
      {viewer ? <Account screen={screen} signOut={signOut} swap={swap} /> : <Link className="cs-btn sm go" href={signInHref}>Sign in</Link>}
    </div>
  </header>;
}

function CouponRow({ coupon, showing, busy, onShow, onUse }: { coupon: Coupon; showing: boolean; busy: boolean; onShow: () => void; onUse: () => void }) {
  const ready = coupon.earned && !coupon.usedAt;
  return <li className={ready ? 'ready' : ''}><Gauge have={coupon.done} need={coupon.need} /><div><small>{coupon.giver}</small><b>{coupon.text}</b><span>{coupon.progress}</span></div>
    {ready && <button aria-expanded={showing} onClick={onShow}>{showing ? 'Close' : 'Ready'}</button>}
    {ready && showing && <div className="show"><span>Show at the counter · <Clock /></span><button disabled={busy} onClick={onUse}>Mark as used</button></div>}</li>;
}

/** The avatar with its level badge, and the card under it: the level, and for the admin alone, "Admin". The groups pages show the same one (app/groups/bar.tsx), with their own links as `more`. */
export function Account({ screen, signOut, swap = [], more = null }: { screen: Screen; signOut: ReactNode; swap?: SwapCampus[]; /** Links of the pages this bar is on, above the way out. */ more?: ReactNode }) {
  const viewer = screen.viewer!, [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null), [kit, setKit] = useState('');
  // The pick shows at once, and goes back if it could not be kept.
  const [face, setFace] = useState(viewer.face), [picking, setPicking] = useState(false), [moved, setMoved] = useState(false), [, save] = useTransition();
  // Their own campus, for a school with more than one, and the move to another.
  const home = swap.find(each => each.home), [moving, move] = useTransition(), [moveNote, setMoveNote] = useState<string | null>(null);
  const choose = (next: number) => { const before = face; setFace(next); setMoved(true); save(async () => { if (!(await faceAction(next)).ok) setFace(before); }); };
  // The animal they had made from a photo, how many more they may make, and whether the pane that makes one is open.
  const [own, setOwn] = useState(viewer.own), [owns, setOwns] = useState(viewer.owns), [left, setLeft] = useState(viewer.makesLeft), [asked, setAsked] = useState(viewer.asked), [making, setMaking] = useState(false);
  const me: Face = { first: viewer.first, photo: face === PHOTO ? viewer.ownPhoto : face === CUSTOM ? own : animal(face), ink: asked }, level = viewer.level, top = LEVELS[LEVELS.length - 1].from, next = LEVELS[level + 1];
  /** One of the animals they had made, which may not be the one in use. */
  const chooseOwn = (next: string) => { const before = { face, own }; setOwn(next); setFace(CUSTOM); setMoved(true); save(async () => { if (!(await ownFaceAction(next)).ok) { setOwn(before.own); setFace(before.face); } }); };
  useEffect(() => {
    if (!open) return;
    // By the path the click took, not by where its target is now: a button that swaps the card's contents is gone from the card by then.
    const away = (event: MouseEvent) => { if (box.current && !event.composedPath().includes(box.current)) setOpen(false); }, key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('click', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', key); };
  }, [open]);
  /** Another animal, never the one you have: the front door's seat, kept. */
  // Shuffle gives any animal the person may use: the premium ones too, once they subscribed.
  const shuffle = () => {
    const pool = [...viewer.picks.school, ...viewer.picks.core, ...(asked || viewer.admin ? viewer.picks.premium : [])].filter(tile => tile.face === null ? !(face === CUSTOM && own === tile.src) : tile.face !== face), next = pool[Math.floor(Math.random() * pool.length)];
    if (next) { if (next.face === null) chooseOwn(next.src); else choose(next.face); }
  };
  /** One animal of the picker. A premium one opens the plan for someone who has not subscribed. */
  // The picker is one grid. `find` narrows it by name, `only` to one kind: the school's own animals, or the Ink ones. Each kind wears its ring wherever it is.
  const [find, setFind] = useState(''), [only, setOnly] = useState<'' | 'school' | 'ink'>('');
  const hit = (words: string, kind: '' | 'school' | 'ink') => (!only || only === kind) && words.toLowerCase().includes(find.trim().toLowerCase());
  const called = (one: Pet) => `${one.name} ${one.face === null ? 'made' : NAMES[one.face] ?? ''}`;
  const tile = (one: Pet, premium = false, locked = false, school = false) => <button key={one.src} className={`cs-pet ${premium ? 'gold' : school ? 'school' : ''}`} title={one.face === null ? undefined : NAMES[one.face]} aria-pressed={one.face === null ? face === CUSTOM && own === one.src : face === one.face} aria-label={one.name}
    onClick={() => locked ? setMaking(true) : one.face === null ? chooseOwn(one.src) : choose(one.face)}><img src={one.src} alt="" />{premium ? <InkMark /> : school && <SchoolMark />}</button>;
  const avatar = (big = false) => <span className={`cs-ava ${big ? 'big' : ''}`}><FaceDot key={big ? face : 0} face={me} className={big && moved ? 'new' : ''} /><b className="cs-lvb">{level + 1}</b>{viewer.admin && <i className="cs-crown" title="Admin"><svg viewBox="0 0 24 20" aria-hidden="true"><path d="M3 16.5 1.5 5.5l5.6 4.2L12 2l4.9 7.7 5.6-4.2L21 16.5z" /><circle cx="1.8" cy="4.6" r="1.6" /><circle cx="12" cy="2" r="1.7" /><circle cx="22.2" cy="4.6" r="1.6" /></svg></i>}</span>;
  return <div className="cs-acct" ref={box}>
    <button aria-expanded={open} aria-label={`${viewer.name}, ${LEVELS[level].name}. Show your level`} onClick={() => { setKit(kitNow()); setPicking(false); setMoved(false); setOpen(!open); }}>{avatar()}</button>
    {open && <div className="cs-lvl" role="dialog" aria-label="Your level">
      <div className="cs-lvl-top"><button className="cs-ava-pick" aria-expanded={picking} aria-label="Change your picture" onClick={() => { setPicking(!picking); setMaking(false); }}>{avatar(true)}<i><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.5 2.8l2.7 2.7L5.6 13.1 2.5 13.5l.4-3.1z" /></svg></i></button><div><strong>{viewer.name}</strong><span>{LEVELS[level].name} · level {level + 1} of {LEVELS.length}</span></div>
        <div className="cs-lvbar" style={{ '--to': Math.min(1, viewer.outings / top) } as React.CSSProperties}><i />{LEVELS.slice(1).map(each => <em key={each.name} style={{ left: `${each.from / top * 100}%` }} className={viewer.outings >= each.from ? 'hit' : ''} />)}</div>
        <p><span><b>{viewer.outings}</b> / {top} outings</span><span>{next ? `${next.from - viewer.outings} more to ${next.name}` : 'Top level'}</span></p></div>
      {/* The plan's one row. It steps aside for the picker, where an Ink animal opens the plan for someone without it. */}
      {!picking && <div className="cs-inkrow"><InkMark /><span><b>{asked ? 'You have Ink' : 'Loop Ink'}</b><small>{asked ? 'Every Ink animal is yours to pick.' : 'More animals, and your own pet drawn from a photo.'}</small></span><a className="cs-btn sm" href={INK_PAGE}>See it</a></div>}
      {/* Which campus of the school is the person's own, for a school with more than one. The other is one press away. */}
      {!picking && home && swap.filter(each => !each.home).map(each => <div className="cs-inkrow cs-camprow" key={each.slug}><span><b>Your campus is {home.title}</b><small>{moveNote ?? 'You can look at the other one any time from the map.'}</small></span>
        <button className="cs-btn sm" disabled={moving} onClick={() => move(async () => { const done = await changeCampusAction(each.slug); if (done.ok) window.location.assign(`/c/${each.slug}`); else setMoveNote(done.message); })}>Change to {each.title}</button></div>)}
      {/* eslint-disable @next/next/no-img-element -- icons from public/animals, and the sign-in account's photo at its own address */}
      {picking && making ? <OwnFace asked={asked} left={left} free={viewer.admin} current={owns.includes(own ?? '') ? own ?? '' : owns[owns.length - 1] ?? ''} onAsked={() => setAsked(true)} onBack={() => setMaking(false)} onKept={(kept, dropped) => { setOwn(kept); setOwns(had => [...had.filter(one => one !== kept && one !== dropped), kept]); }} onMade={(made, more) => { setOwn(made); setOwns(had => [...had, made]); setLeft(more); setAsked(true); setFace(CUSTOM); setMoved(true); }} />
      : picking ? <div className="cs-lvl-body cs-pets"><div className="cs-pets-top"><input type="search" value={find} onChange={event => setFind(event.target.value)} aria-label="Search animals" placeholder="Search" />
          {viewer.picks.school.length > 0 && <button className="cs-btn sm school" aria-pressed={only === 'school'} onClick={() => setOnly(only === 'school' ? '' : 'school')}><SchoolMark />Mascots</button>}
          <button className="cs-btn sm gold" aria-pressed={only === 'ink'} onClick={() => setOnly(only === 'ink' ? '' : 'ink')}><InkMark />Ink</button>
          <button className="cs-btn sm icon" aria-label="Shuffle" title="Shuffle" onClick={shuffle}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 4.5h2.6c1.3 0 2.4.7 3 1.8l1.8 3.4c.6 1.1 1.7 1.8 3 1.8h2.6M12.5 9.5l2 2-2 2M1.5 11.5h2.6c.8 0 1.6-.3 2.1-.8M9.8 5.3c.5-.5 1.3-.8 2.1-.8h2.6M12.5 2.5l2 2-2 2" /></svg></button>
          <button className="cs-btn sm go icon" aria-label="Done" title="Done" onClick={() => setPicking(false)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" /></svg></button></div>
        <div className="cs-pets-grid" role="group" aria-label="Pick your picture">
          {/* Making one is always first. Then the person's own, their school's, the premium ones, and the rest. */}
          <button className="cs-pet add gold" aria-label="Create your own" onClick={() => setMaking(true)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg></button>
          {viewer.ownPhoto && hit('your photo', '') && <button className="cs-pet photo" aria-pressed={face === PHOTO} aria-label="Your photo" onClick={() => choose(PHOTO)}><img src={viewer.ownPhoto} alt="" /></button>}
          {hit('your own animal made', 'ink') && owns.filter(one => ![...viewer.picks.core, ...viewer.picks.premium].some(each => each.src === one)).map((one, at) => <button key={one} className="cs-pet gold" aria-pressed={face === CUSTOM && own === one} aria-label={`Your own animal${owns.length > 1 ? ` ${at + 1}` : ''}`} onClick={() => chooseOwn(one)}><img src={one} alt="" /></button>)}
          {viewer.picks.school.filter(one => hit(called(one), 'school')).map(one => tile(one, false, false, true))}
          {viewer.picks.premium.filter(one => hit(called(one), 'ink')).map(one => tile(one, true, !asked && !viewer.admin))}
          {viewer.picks.core.filter(one => hit(called(one), '')).map(one => tile(one))}</div>
        <small>Animal icons by <a href="https://www.figma.com/community/file/1514963172455082116" target="_blank" rel="noreferrer">Tran Mau Tri Tam</a>, CC BY 4.0.</small></div>
      /* eslint-enable @next/next/no-img-element */
      : <div className="cs-lvl-body"><p>An outing is any time you check in with at least one other person.</p>
        <ul>{LEVELS.map((each, at) => <li key={each.name} className={at === level ? 'now' : ''}><b>{at + 1}</b><div><strong>{each.name}</strong><span>{each.gets}</span></div><small>{at === level ? 'You' : at < level ? 'Passed' : `${each.from - viewer.outings} to go`}</small></li>)}</ul>
        <div className="cs-kits" role="group" aria-label="Colours"><h4>Colours</h4><div>{KITS.map(each => <button key={each.slug} className="cs-kit" data-kit={each.slug} aria-pressed={kit === each.slug} onClick={() => { pickKit(each.slug); setKit(each.slug); }}><i />{each.name}</button>)}</div></div>
        {viewer.admin && <nav className="cs-lvl-more" aria-label="Admin"><h4>Admin</h4><Link href="/c/admin">Run the campus</Link><Link href="/groups">The groups site</Link><Link href="/groups/archive">How we got here</Link></nav>}
        {more}
        {signOut && <div className="cs-lvl-more">{signOut}</div>}</div>}</div>}
  </div>;
}
