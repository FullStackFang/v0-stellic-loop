'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { checkInAction, imInAction, inviteAction, joinAction, leaveAction, useCouponAction as markCouponUsed, useRewardAction as markRewardUsed, type ActResult } from '@/app/c/actions';
import { Rings } from '@/components/LoopGlyphs';
import { LEVELS } from '@/lib/campus/levels';
import { KITS, kitNow, pickKit } from './kit';
import { pick, type Findable } from '@/lib/campus/search';
import type { Coupon, Face, Screen, Seat, Ticket } from '@/lib/campus/view';

// The campus screen, "This week" (design D16): one line of top bar, the search line, the count line, a sideways row of
// tickets whose details unfold beside them, and the rewards a person is earning. Ported from screen 1 of
// public/demo/mockups-campus-usecases.html. Everything it shows of other people was decided on the server (lib/campus/screen.ts).

const SAY = ['exercise', 'eat with people', 'study', 'startups', 'tonight'];
const Chevron = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" /></svg>;

export function FaceDot({ face, className = '' }: { face: Face; className?: string }) {
  const cls = `cs-face ${face.here ? 'here' : ''} ${className}`.trim(), name = face.me ? 'You' : face.first;
  // eslint-disable-next-line @next/next/no-img-element -- the sign-in account's photo, at its own address
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
  const [typed, setTyped] = useState(''), [view, setView] = useState<'best' | 'all'>('best');
  const [open, setOpen] = useState<{ id: string; pane: Pane; fresh: boolean } | null>(openId ? { id: openId, pane: 'more', fresh: false } : null);
  const [entering, setEntering] = useState(false), [message, setMessage] = useState(''), [copied, setCopied] = useState(false), [showing, setShowing] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const rail = useRef<HTMLDivElement>(null), [ends, setEnds] = useState({ left: true, right: true });

  const picked = useMemo(() => pick(tickets.map((ticket): Findable => ({ id: ticket.id, title: ticket.title, host: ticket.by, place: ticket.place, source: ticket.source, words: ticket.words, pull: ticket.pull })), typed, view, campus.listSource), [tickets, typed, view, campus.listSource]);
  const byId = useMemo(() => new Map(tickets.map(ticket => [ticket.id, ticket])), [tickets]);
  const shown = [...picked.best, ...picked.rest], opened = open && shown.includes(open.id) ? byId.get(open.id) ?? null : null;

  const measure = () => { const row = rail.current; if (row) setEnds({ left: row.scrollLeft < 8, right: row.scrollLeft > row.scrollWidth - row.clientWidth - 8 }); };
  useEffect(() => { measure(); addEventListener('resize', measure); return () => removeEventListener('resize', measure); }, [shown.length, opened?.id]);
  // A ticket that was just opened is brought to the left edge, so its panel has the room.
  useEffect(() => {
    const row = rail.current, card = open?.fresh ? row?.querySelector<HTMLElement>('.cs-ev.open') : null;
    if (row && card) row.scrollTo?.({ left: row.scrollLeft + card.getBoundingClientRect().left - row.getBoundingClientRect().left - 6, behavior: 'smooth' });
  }, [open]);

  const show = (id: string, pane: Pane) => { setCopied(false); setOpen(now => now?.id === id && now.pane === pane ? null : { id, pane, fresh: true }); };
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
        <div className="cs-body"><h3>{ticket.title}</h3><p>{ticket.source && <span className="cs-pill src">{ticket.source}</span>}{[ticket.by, ticket.place].filter(Boolean).join(' · ')}</p></div>
        <button className="cs-more" aria-expanded={details} onClick={() => show(ticket.id, 'more')}>{details ? 'Close' : 'Details'}<Chevron /></button></div>
      {stub(ticket)}
    </article>;
  };

  const more = (ticket: Ticket) => {
    const { map } = ticket, box = map && [map.lon - .0062, map.lat - .0026, map.lon + .0062, map.lat + .0026].map(n => n.toFixed(4)).join('%2C');
    const people = ticket.mine ? ticket.mine.members.filter(face => !face.me).map(face => ({ ...face, why: face.here ? 'Checked in' : 'In your group' })) : ticket.known;
    return <div className={`cs-regp ${map ? '' : 'wide'}`}><div className="cs-regd">
      {ticket.about && <p>{ticket.about}</p>}
      {ticket.how && <p className="how"><b>How it unlocks</b>{ticket.how}</p>}
      <ul className="cs-facts"><li><b>{ticket.day}, {ticket.time}</b>{ticket.ends ?? 'No end time given'}</li>
        {ticket.by && <li><b>{ticket.by}</b>{ticket.source ? `Listed on ${ticket.source}` : ticket.going ? `${ticket.going} going` : 'Nobody is in yet'}</li>}
        {!map && ticket.place && <li><b>{ticket.place}</b>Where</li>}
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
  const row = (id: string, at: number) => { const ticket = byId.get(id)!; return [card(ticket, at), opened?.id === id ? sheet : null]; };
  const [count, ...words] = (picked.marker ?? '').split(' ');

  return <div className="cs">
    <header className="cs-nav">
      <Link className="cs-wm" href={`/c/${campus.slug}`}><Rings />Loop</Link>
      <nav className="cs-links" aria-label={campus.name}><Link href={`/c/${campus.slug}`} aria-current="page">This week</Link>
        {viewer?.groups.map(group => <Link key={group.href} href={group.href}><i>{group.name.slice(0, 1).toUpperCase()}</i>{group.name}</Link>)}</nav>
      <div className="cs-nav-end">
        {live && (live.usedAt ? <div className="cs-live used"><small>{live.giver}</small><b>{byId.get(live.listingId)?.status ?? 'Used'}</b></div>
          : <div className="cs-live"><small>Show at the counter</small><b>{live.text}</b><Clock /><button disabled={busy} onClick={() => run(() => markRewardUsed(live.listingId))}>Mark as used</button></div>)}
        {viewer ? <><Link className="cs-btn sm go" href={`/c/${campus.slug}/post`}>Post a plan</Link><Account screen={screen} signOut={signOut} /></> : <><Link className="cs-btn sm" href={`/c/${campus.slug}/post`}>Post a plan</Link><Link className="cs-btn sm go" href={signInHref}>Sign in</Link></>}
      </div>
    </header>
    <main className="cs-main"><section className="cs-fill">
      <div className="cs-ask"><input type="search" placeholder="What do you feel like doing?" aria-label="Say what you feel like doing" value={typed} onChange={event => search(event.target.value)} />
        <div className="cs-tabs">{([['best', 'Best for you'], ['all', `All of ${campus.listSource}`]] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => { setView(key); setOpen(null); setEntering(true); }}>{label}</button>)}</div></div>
      <div className="cs-count"><h2 aria-live="polite">{picked.line}</h2><div className="cs-says"><small>Try</small>{SAY.map(word => <button key={word} className="cs-opt" aria-pressed={typed === word} onClick={() => search(typed === word ? '' : word)}>{word}</button>)}</div></div>
      {message && <p className="cs-alert" role="alert">{message}</p>}
      <div className={`cs-evs ${entering ? 'in' : ''}`} key={entering ? `${typed}|${view}` : 'row'}>
        {picked.nothing ? <div className="cs-nothing"><h3>{typed.trim() ? 'Nothing matches' : 'Nothing here yet'}</h3><p>{typed.trim() ? 'Try another word, or post a plan of your own.' : 'Post a plan of your own and it shows here at once.'}</p></div>
          : <div className="cs-railwrap"><div className="cs-rail" ref={rail} onScroll={measure}>
              {picked.best.map(row)}
              {picked.rest.length > 0 && <div className="cs-then" style={{ '--i': picked.best.length } as React.CSSProperties}><b>{count}</b><span>{words.join(' ')}</span></div>}
              {picked.rest.map((id, at) => row(id, picked.best.length + 1 + at))}</div>
            <button className="cs-rgo l" hidden={ends.left} aria-label="Earlier events" onClick={() => rail.current?.scrollBy({ left: -604, behavior: 'smooth' })}><Chevron /></button>
            <button className="cs-rgo r" hidden={ends.right} aria-label="More events" onClick={() => rail.current?.scrollBy({ left: 604, behavior: 'smooth' })}><Chevron /></button></div>}
      </div>
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
  const me: Face = { first: viewer.first, photo: viewer.photo }, level = viewer.level, top = LEVELS[LEVELS.length - 1].from, next = LEVELS[level + 1];
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); }, key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('click', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', key); };
  }, [open]);
  const avatar = (big = false) => <span className={`cs-ava ${big ? 'big' : ''}`}><FaceDot face={me} /><b className="cs-lvb">{level + 1}</b></span>;
  return <div className="cs-acct" ref={box}>
    <button aria-expanded={open} aria-label={`${viewer.name}, ${LEVELS[level].name}. Show your level`} onClick={() => { setKit(kitNow()); setOpen(!open); }}>{avatar()}</button>
    {open && <div className="cs-lvl" role="dialog" aria-label="Your level">
      <div className="cs-lvl-top">{avatar(true)}<div><strong>{viewer.name}</strong><span>{LEVELS[level].name} · level {level + 1} of {LEVELS.length}</span></div>
        <div className="cs-lvbar" style={{ '--to': Math.min(1, viewer.outings / top) } as React.CSSProperties}><i />{LEVELS.slice(1).map(each => <em key={each.name} style={{ left: `${each.from / top * 100}%` }} className={viewer.outings >= each.from ? 'hit' : ''} />)}</div>
        <p><span><b>{viewer.outings}</b> / {top} outings</span><span>{next ? `${next.from - viewer.outings} more to ${next.name}` : 'Top level'}</span></p></div>
      <div className="cs-lvl-body"><p>An outing is any time you check in with at least one other person.</p>
        <ul>{LEVELS.map((each, at) => <li key={each.name} className={at === level ? 'now' : ''}><b>{at + 1}</b><div><strong>{each.name}</strong><span>{each.gets}</span></div><small>{at === level ? 'You' : at < level ? 'Passed' : `${each.from - viewer.outings} to go`}</small></li>)}</ul>
        <div className="cs-kits" role="group" aria-label="Colours"><h4>Colours</h4><div>{KITS.map(each => <button key={each.slug} className="cs-kit" data-kit={each.slug} aria-pressed={kit === each.slug} onClick={() => { pickKit(each.slug); setKit(each.slug); }}><i />{each.name}</button>)}</div></div>
        {viewer.admin && <nav className="cs-lvl-more" aria-label="Admin"><h4>Admin</h4><Link href="/c/admin">Run the campus</Link><Link href="/groups">The groups site</Link><Link href="/groups/archive">How we got here</Link></nav>}
        {signOut && <div className="cs-lvl-more">{signOut}</div>}</div></div>}
  </div>;
}
