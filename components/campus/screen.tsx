'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { checkInAction, faceAction, imInAction, inviteAction, joinAction, leaveAction, useCouponAction as markCouponUsed, useRewardAction as markRewardUsed, type ActResult } from '@/app/c/actions';
import { Rings } from '@/components/LoopGlyphs';
import { ANIMALS, animal, PHOTO } from '@/lib/campus/animals';
import { LEVELS } from '@/lib/campus/levels';
import { KITS, kitNow, pickKit } from './kit';
import { meant, pick, type Findable } from '@/lib/campus/search';
import { landOf } from '@/lib/campus/sections';
import { Composer, type Soon } from './composer';
import { Near } from './near';
import type { Coupon, Face, Screen, Seat, Ticket } from '@/lib/campus/view';

// The campus screen, "This week" (design D16): one line of top bar, the search line, the count line, a sideways row of
// tickets whose details unfold beside them, and the rewards a person is earning. Ported from screen 1 of
// public/demo/mockups-campus-usecases.html. Everything it shows of other people was decided on the server (lib/campus/screen.ts).

const SAY = ['exercise', 'eat with people', 'study', 'startups', 'tonight'];
const Chevron = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" /></svg>;

export function FaceDot({ face, className = '' }: { face: Face; className?: string }) {
  const cls = `cs-face ${face.photo?.startsWith('/animals/') ? 'pet' : ''} ${face.here ? 'here' : ''} ${className}`.replace(/\s+/g, ' ').trim(), name = face.me ? 'You' : face.first;
  // eslint-disable-next-line @next/next/no-img-element -- an icon from public/animals, or the sign-in account's photo at its own address
  return face.photo ? <img className={cls} src={face.photo} alt={name} title={name} /> : <i className={cls} role="img" aria-label={name} title={name}>{name.slice(0, 1).toUpperCase()}</i>;
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
export type ScreenProps = { screen: Screen; signInHref: string; openId?: string | null; signOut?: ReactNode };

export function CampusScreen({ screen, signInHref, openId = null, signOut = null }: ScreenProps) {
  const { campus, viewer, tickets, earning, live } = screen;
  const [typed, setTyped] = useState(''), [view, setView] = useState<'best' | 'all' | 'near'>('best');
  const [open, setOpen] = useState<{ id: string; pane: Pane; fresh: boolean } | null>(openId ? { id: openId, pane: 'more', fresh: false } : null);
  const [entering, setEntering] = useState(false), [message, setMessage] = useState(''), [copied, setCopied] = useState(false), [showing, setShowing] = useState<string | null>(null);
  const [busy, start] = useTransition(), [posting, setPosting] = useState(false);
  const rail = useRef<HTMLDivElement>(null), [ends, setEnds] = useState({ left: true, right: true });

  // "Near you" is the week on a map (components/campus/near.tsx), for a campus whose sections are drawn. It searches as "Best for you" does.
  const land = useMemo(() => landOf(campus.slug), [campus.slug]), near = view === 'near' && !!land;
  const picked = useMemo(() => pick(tickets.map((ticket): Findable => ({ id: ticket.id, title: ticket.title, host: ticket.by, place: ticket.place, source: ticket.source, words: ticket.words, pull: ticket.pull })), typed, view === 'all' ? 'all' : 'best', campus.listSource), [tickets, typed, view, campus.listSource]);
  const byId = useMemo(() => new Map(tickets.map(ticket => [ticket.id, ticket])), [tickets]);
  const shown = [...picked.best, ...picked.rest], opened = open && shown.includes(open.id) ? byId.get(open.id) ?? null : null;
  const onMap = useMemo(() => { const left = new Set([...picked.best, ...picked.rest]); return tickets.filter(ticket => ticket.map && left.has(ticket.id)); }, [tickets, picked]);

  const measure = () => { const row = rail.current; if (row) setEnds({ left: row.scrollLeft < 8, right: row.scrollLeft > row.scrollWidth - row.clientWidth - 8 }); };
  useEffect(() => { measure(); addEventListener('resize', measure); return () => removeEventListener('resize', measure); }, [shown.length, opened?.id]);
  // A ticket that was just opened is brought to the left edge, so its panel has the room.
  useEffect(() => {
    const row = rail.current, card = open?.fresh ? row?.querySelector<HTMLElement>('.cs-ev.open') : null;
    if (row && card) row.scrollTo?.({ left: row.scrollLeft + card.getBoundingClientRect().left - row.getBoundingClientRect().left - 6, behavior: 'smooth' });
  }, [open]);

  // Plans already on at an @place, for the posting panel: a person naming that place can join one instead.
  const soon = useMemo(() => tickets.filter(ticket => ticket.tag).map((ticket): Soon => ({ id: ticket.id, tag: ticket.tag!, title: ticket.title, day: ticket.day, time: ticket.time, mine: !!ticket.mine, faces: ticket.known,
    who: ticket.known.length ? `${ticket.known[0].first}${ticket.going > 1 ? ` and ${ticket.going - 1} ${ticket.going === 2 ? 'other' : 'others'}` : ''}` : `${ticket.going} going` })), [tickets]);
  /** The "+" opens the posting panel at the start of the row, and closes it. */
  const togglePost = () => { setOpen(null); setMessage(''); setPosting(now => !now); rail.current?.scrollTo?.({ left: 0, behavior: 'smooth' }); };

  const show = (id: string, pane: Pane) => { setCopied(false); setPosting(false); setOpen(now => now?.id === id && now.pane === pane ? null : { id, pane, fresh: true }); };
  const search = (next: string) => { setTyped(next); setOpen(null); setEntering(true); rail.current?.scrollTo?.({ left: 0 }); };
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
    return <article key={ticket.id} className={`cs-ev ${isOpen ? 'open' : ''}`} style={{ '--i': at } as React.CSSProperties}
      onClick={event => { if (!(event.target as HTMLElement).closest('button, a, input')) show(ticket.id, 'more'); }}>
      <div className="cs-top"><Tile top={ticket.day} big={ticket.time} met={ticket.stub.kind === 'group' && ticket.stub.state === 'met'} />
        <div className="cs-body"><h3>{ticket.title}</h3><p>{ticket.source && <span className="cs-pill src">{ticket.source}</span>}{ticket.tag && <b className="cs-at">@{ticket.tag}</b>}{[ticket.by, ticket.place].filter(Boolean).join(' · ')}</p></div>
        <button className="cs-more" aria-expanded={details} onClick={() => show(ticket.id, 'more')}>{details ? 'Close' : 'Details'}<Chevron /></button></div>
      {stub(ticket)}
    </article>;
  };

  const more = (ticket: Ticket) => {
    const map = near ? null : ticket.map, box = map && [map.lon - .0062, map.lat - .0026, map.lon + .0062, map.lat + .0026].map(n => n.toFixed(4)).join('%2C');
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
    <Composer campus={campus} tags={screen.places} soon={soon} onDone={() => setPosting(false)} /></div>;
  const nothing = <div className="cs-nothing"><div className="cs-nothing-top"><Tile top="This week" big="Open" /><div><h3>{typed.trim() ? 'Nothing matches' : 'Nothing here yet'}</h3><p>{typed.trim() ? 'Try another word, or post a plan of your own.' : 'Post a plan of your own and it shows here at once.'}</p></div></div>
    <div className="cs-nothing-stub"><small>Yours could be the first this week.</small></div></div>;
  const plus = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15" /></svg>;
  const row = (id: string, at: number) => { const ticket = byId.get(id)!; return [card(ticket, at), opened?.id === id ? sheet : null]; };
  const [count, ...words] = (picked.marker ?? '').split(' ');
  // Only an event at a place Loop knows has a spot on the map, and the line says how many do.
  const nearLine = meant(typed).length ? `${onMap.length} on the map for “${typed.trim()}”` : !shown.length ? 'Nothing on this week yet' : onMap.length === shown.length ? `${onMap.length} on the map this week` : `${onMap.length} of ${shown.length} this week are on the map`;

  return <div className="cs">
    <header className="cs-nav">
      <Link className="cs-wm" href={`/c/${campus.slug}`}><Rings />Loop</Link>
      <nav className="cs-links" aria-label={campus.name}><Link href={`/c/${campus.slug}`} aria-current="page">This week</Link>
        {viewer?.groups.map(group => <Link key={group.href} href={group.href}><i>{group.name.slice(0, 1).toUpperCase()}</i>{group.name}</Link>)}</nav>
      <div className="cs-nav-end">
        {live && (live.usedAt ? <div className="cs-live used"><small>{live.giver}</small><b>{byId.get(live.listingId)?.status ?? 'Used'}</b></div>
          : <div className="cs-live"><small>Show at the counter</small><b>{live.text}</b><Clock /><button disabled={busy} onClick={() => run(() => markRewardUsed(live.listingId))}>Mark as used</button></div>)}
        {viewer ? <Account screen={screen} signOut={signOut} /> : <Link className="cs-btn sm go" href={signInHref}>Sign in</Link>}
      </div>
    </header>
    <main className="cs-main"><section className="cs-fill">
      <div className="cs-ask"><input type="search" placeholder="What do you feel like doing?" aria-label="Say what you feel like doing" value={typed} onChange={event => search(event.target.value)} />
        <div className="cs-tabs">{([['best', 'Best for you'], ['all', `All of ${campus.listSource}`], ...(land ? [['near', 'Near you'] as const] : [])] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => { setView(key); setOpen(null); setEntering(true); }}>{label}</button>)}</div></div>
      {/* The count sits in a pill, and posting starts from the "+" at its left end: above the row, so it is there wherever the row is scrolled to (design D13). */}
      <div className="cs-count"><div className="cs-tally">
        {viewer ? <button className="cs-plus" aria-label="Post a plan" aria-expanded={posting} onClick={togglePost}>{plus}</button> : <Link className="cs-plus" aria-label="Post a plan" href={signInHref}>{plus}</Link>}
        <h2 aria-live="polite">{near ? nearLine : picked.line}</h2></div>
        <div className="cs-says"><small>Try</small>{SAY.map(word => <button key={word} className="cs-opt" aria-pressed={typed === word} onClick={() => search(typed === word ? '' : word)}>{word}</button>)}</div></div>
      {message && <p className="cs-alert" role="alert">{message}</p>}
      {near ? <>{postSheet && <div className="cs-railwrap cs-near-post"><div className="cs-rail">{postSheet}</div></div>}
        <Near land={land} tickets={onMap} me={viewer && { first: viewer.first, photo: viewer.photo }} asked={meant(typed).length ? typed.trim() : ''} picked={opened?.id ?? null} onPick={id => { setCopied(false); setPosting(false); setOpen(id ? { id, pane: 'more', fresh: true } : null); }}>
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
      {earning.length > 0 && <div className="cs-shelf"><h2>Rewards you are earning</h2><ul className="cs-coupons">{earning.map(coupon => <CouponRow key={coupon.id} coupon={coupon} showing={showing === coupon.id} busy={busy}
        onShow={() => setShowing(now => now === coupon.id ? null : coupon.id)} onUse={() => run(() => markCouponUsed(coupon.id), () => setShowing(null))} />)}</ul></div>}
    </section></main>
  </div>;
}

function CouponRow({ coupon, showing, busy, onShow, onUse }: { coupon: Coupon; showing: boolean; busy: boolean; onShow: () => void; onUse: () => void }) {
  const ready = coupon.earned && !coupon.usedAt;
  return <li className={ready ? 'ready' : ''}><Gauge have={coupon.done} need={coupon.need} /><div><small>{coupon.giver}</small><b>{coupon.text}</b><span>{coupon.progress}</span></div>
    {ready && <button aria-expanded={showing} onClick={onShow}>{showing ? 'Close' : 'Ready'}</button>}
    {ready && showing && <div className="show"><span>Show at the counter · <Clock /></span><button disabled={busy} onClick={onUse}>Mark as used</button></div>}</li>;
}

/** The avatar with its level badge, and the card under it: the level, and for the admin alone, "Admin". */
function Account({ screen, signOut }: { screen: Screen; signOut: ReactNode }) {
  const viewer = screen.viewer!, [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null), [kit, setKit] = useState('');
  // The pick shows at once, and goes back if it could not be kept.
  const [face, setFace] = useState(viewer.face), [picking, setPicking] = useState(false), [moved, setMoved] = useState(false), [, save] = useTransition();
  const choose = (next: number) => { const before = face; setFace(next); setMoved(true); save(async () => { if (!(await faceAction(next)).ok) setFace(before); }); };
  const me: Face = { first: viewer.first, photo: face === PHOTO ? viewer.ownPhoto : animal(face) }, level = viewer.level, top = LEVELS[LEVELS.length - 1].from, next = LEVELS[level + 1];
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); }, key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('click', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', key); };
  }, [open]);
  /** Another animal, never the one you have: the front door's seat, kept. */
  const shuffle = () => { let next = face; while (next === face) next = Math.floor(Math.random() * ANIMALS); choose(next); };
  const avatar = (big = false) => <span className={`cs-ava ${big ? 'big' : ''}`}><FaceDot key={big ? face : 0} face={me} className={big && moved ? 'new' : ''} /><b className="cs-lvb">{level + 1}</b></span>;
  return <div className="cs-acct" ref={box}>
    <button aria-expanded={open} aria-label={`${viewer.name}, ${LEVELS[level].name}. Show your level`} onClick={() => { setKit(kitNow()); setPicking(false); setMoved(false); setOpen(!open); }}>{avatar()}</button>
    {open && <div className="cs-lvl" role="dialog" aria-label="Your level">
      <div className="cs-lvl-top"><button className="cs-ava-pick" aria-expanded={picking} aria-label="Change your picture" onClick={() => setPicking(!picking)}>{avatar(true)}<i><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.5 2.8l2.7 2.7L5.6 13.1 2.5 13.5l.4-3.1z" /></svg></i></button><div><strong>{viewer.name}</strong><span>{LEVELS[level].name} · level {level + 1} of {LEVELS.length}</span></div>
        <div className="cs-lvbar" style={{ '--to': Math.min(1, viewer.outings / top) } as React.CSSProperties}><i />{LEVELS.slice(1).map(each => <em key={each.name} style={{ left: `${each.from / top * 100}%` }} className={viewer.outings >= each.from ? 'hit' : ''} />)}</div>
        <p><span><b>{viewer.outings}</b> / {top} outings</span><span>{next ? `${next.from - viewer.outings} more to ${next.name}` : 'Top level'}</span></p></div>
      {/* eslint-disable @next/next/no-img-element -- icons from public/animals, and the sign-in account's photo at its own address */}
      {picking ? <div className="cs-lvl-body cs-pets"><div className="cs-pets-top"><h4>Pick your picture</h4>
          <button className="cs-btn sm" onClick={shuffle}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 4.5h2.6c1.3 0 2.4.7 3 1.8l1.8 3.4c.6 1.1 1.7 1.8 3 1.8h2.6M12.5 9.5l2 2-2 2M1.5 11.5h2.6c.8 0 1.6-.3 2.1-.8M9.8 5.3c.5-.5 1.3-.8 2.1-.8h2.6M12.5 2.5l2 2-2 2" /></svg>Shuffle</button>
          <button className="cs-btn sm go" onClick={() => setPicking(false)}>Done</button></div>
        <div className="cs-pets-grid" role="group" aria-label="Pick your picture">
          {viewer.ownPhoto && <button className="cs-pet photo" aria-pressed={face === PHOTO} aria-label="Your photo" onClick={() => choose(PHOTO)}><img src={viewer.ownPhoto} alt="" /></button>}
          {Array.from({ length: ANIMALS }, (_, at) => <button key={at} className="cs-pet" aria-pressed={face === at} aria-label={`Animal ${at + 1}`} onClick={() => choose(at)}><img src={animal(at)} alt="" /></button>)}</div>
        <small>Animal icons by <a href="https://www.figma.com/community/file/1514963172455082116" target="_blank" rel="noreferrer">Tran Mau Tri Tam</a>, CC BY 4.0.</small></div>
      /* eslint-enable @next/next/no-img-element */
      : <div className="cs-lvl-body"><p>An outing is any time you check in with at least one other person.</p>
        <ul>{LEVELS.map((each, at) => <li key={each.name} className={at === level ? 'now' : ''}><b>{at + 1}</b><div><strong>{each.name}</strong><span>{each.gets}</span></div><small>{at === level ? 'You' : at < level ? 'Passed' : `${each.from - viewer.outings} to go`}</small></li>)}</ul>
        <div className="cs-kits" role="group" aria-label="Colours"><h4>Colours</h4><div>{KITS.map(each => <button key={each.slug} className="cs-kit" data-kit={each.slug} aria-pressed={kit === each.slug} onClick={() => { pickKit(each.slug); setKit(each.slug); }}><i />{each.name}</button>)}</div></div>
        {viewer.admin && <nav className="cs-lvl-more" aria-label="Admin"><h4>Admin</h4><Link href="/c/admin">Run the campus</Link><Link href="/groups">The groups site</Link><Link href="/groups/archive">How we got here</Link></nav>}
        {signOut && <div className="cs-lvl-more">{signOut}</div>}</div>}</div>}
  </div>;
}
