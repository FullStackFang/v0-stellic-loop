'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { answerOnYouAction, askGroupAction, claimOnYouAction, interestOnYouAction, type OnYouResult } from '@/app/c/actions';
import { readDue } from '@/lib/campus/line';
import type { OnYouClaim, OnYouGroup, OnYouItem, OnYouView } from '@/lib/campus/on-you';
import '@/app/c/on-you.css';

// "Groups" and "On you" (openspec loop-on-you, design D4 and D12): two counters in the top bar. Groups opens every group the
// person is in and what they are going to, each a row that opens its page. On you is a counter, and behind it what the person's groups need from
// them, soonest first. A row is acted on where it is. When it is done it says so, fades, and the rows under it slide up:
// nothing jumps, and the list keeps its place.

const LABEL = { vote: 'Vote', do: 'Do', show: 'Show up', missed: 'Missed' } as const;
/** How a finished row leaves: it says what was recorded, fades, then the space it held closes. */
export const LEAVE = { fade: 800, fold: 1120, gone: 1520 } as const;
/** Something on the campus week the person is going to. */
export type Going = { id: string; title: string; when: string; href: string; place: string | null; people: number; faces: string[] };
type Leaving = { id: string; at: number; text: string; phase: 'said' | 'out' | 'fold'; row?: OnYouItem; claim?: OnYouClaim };

const Tick = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
/** Puts back, at the place it held, anything that is leaving and that the server no longer lists. */
function withLeaving<T extends { id: string }>(listed: T[], leaving: Leaving[], pick: (each: Leaving) => T | undefined): T[] {
  const all = [...listed];
  for (const each of [...leaving].sort((a, b) => a.at - b.at)) { const kept = pick(each); if (kept && !all.some(one => one.id === kept.id)) all.splice(Math.min(each.at, all.length), 0, kept); }
  return all;
}

export function OnYouPanel({ view, going = [] }: { view: OnYouView; going?: Going[] }) {
  const [open, setOpen] = useState<'oy' | 'gr' | null>(view.claims.length > 0 ? 'oy' : null), [asking, setAsking] = useState(false), [busy, start] = useTransition();
  const [leaving, setLeaving] = useState<Leaving[]>([]), [notes, setNotes] = useState<Record<string, string>>({});
  // What has left stays gone, also while the list the server sent is a moment behind.
  const [finished, setFinished] = useState<string[]>([]), listed = <T extends { id: string }>(all: T[]) => all.filter(each => !finished.includes(each.id) || leaving.some(one => one.id === each.id));
  const box = useRef<HTMLDivElement>(null), timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) setOpen(null); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', away);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', away); };
  }, [open]);

  const rows = withLeaving(listed(view.items), leaving, each => each.row), claims = withLeaving(listed(view.claims), leaving, each => each.claim);
  const state = (id: string) => leaving.find(each => each.id === id);
  const leave = (gone: Omit<Leaving, 'phase'>) => {
    setLeaving(all => [...all.filter(each => each.id !== gone.id), { ...gone, phase: 'said' }]); setFinished(all => [...all, gone.id]);
    const step = (phase: Leaving['phase'] | null, after: number) => timers.current.push(setTimeout(() => setLeaving(all => phase ? all.map(each => each.id === gone.id ? { ...each, phase } : each) : all.filter(each => each.id !== gone.id)), after));
    step('out', LEAVE.fade); step('fold', LEAVE.fold); step(null, LEAVE.gone);
  };
  /** Runs a row's write. Saved, or no longer there to act on: the row says so and leaves. Refused: it says why and stays. */
  const run = (gone: Omit<Leaving, 'phase' | 'text'>, said: string, action: () => Promise<OnYouResult>) => start(async () => {
    setNotes(all => ({ ...all, [gone.id]: '' }));
    const result = await action();
    if (result.ok) leave({ ...gone, text: said });
    else if (result.signIn) location.assign(`/sign-in?redirect_url=${encodeURIComponent(location.pathname)}`);
    else if (result.gone) leave({ ...gone, text: result.message });
    else setNotes(all => ({ ...all, [gone.id]: result.message }));
  });

  const shell = (id: string, kind: string, inner: React.ReactNode) => { const going = state(id); return <li key={id} className={`cs-oy-row ${kind} ${going ? `done ${going.phase}` : ''}`}><div className="cs-oy-clip"><div className="cs-oy-card">{inner}</div></div></li>; };
  const said = (id: string) => { const going = state(id); return going ? <span className="cs-oy-said" role="status"><Tick />{going.text}</span> : null; };
  const note = (id: string) => notes[id] ? <span className="cs-oy-note" role="alert">{notes[id]}</span> : null;

  const row = (item: OnYouItem, at: number) => {
    const gone = { id: item.id, at, row: item }, act = item.act;
    return shell(item.id, `k-${item.k} ${item.soon ? 'soon' : ''}`, <>
      <span className="cs-oy-k">{LABEL[item.k]}</span><time className="cs-oy-when">{item.when}</time>
      <span className="cs-oy-what">{item.what}</span><span className="cs-oy-grp">{item.group}{item.note ? ` · ${item.note}` : ''}</span>
      {(act || notes[item.id]) && <div className="cs-oy-act">{said(item.id) ?? <>
        {act?.type === 'done' && <button className="cs-btn sm go" disabled={busy} onClick={() => run(gone, 'Done', () => answerOnYouAction(item.scope, act.number))}>Done</button>}
        {act?.type === 'pick' && act.options.map(option => <button key={option.number} className="cs-btn sm" disabled={busy} onClick={() => run(gone, `You voted ${option.label}`, () => answerOnYouAction(item.scope, act.number, option.number))}>{option.label}</button>)}
        {act?.type === 'go' && <><button className="cs-btn sm go" disabled={busy} onClick={() => run(gone, 'You are in', () => interestOnYouAction(item.scope, act.event, true))}>I&apos;m in</button>
          <button className="cs-btn sm" disabled={busy} onClick={() => run(gone, 'Not for you', () => interestOnYouAction(item.scope, act.event, false))}>Not for me</button></>}
        {act?.type === 'open' && <Link className="cs-btn sm" href={act.href}>{act.label}</Link>}
        {note(item.id)}</>}</div>}
    </>);
  };
  const hand = (claim: OnYouClaim, at: number) => {
    const gone = { id: claim.id, at, claim };
    return shell(claim.id, 'cs-oy-hand', <>
      <span className="cs-oy-k">Yours?</span>{claim.due && <time className="cs-oy-when">Due {claim.due}</time>}
      <span className="cs-oy-what">{claim.what}</span><span className="cs-oy-grp">{claim.by} put this on you · {claim.group}</span>
      <div className="cs-oy-act">{said(claim.id) ?? <>
        <button className="cs-btn sm go" disabled={busy} onClick={() => run(gone, 'Yours now', () => claimOnYouAction(claim.scope, claim.number, true))}>It&apos;s mine</button>
        <button className="cs-btn sm" disabled={busy} onClick={() => run(gone, 'Handed back', () => claimOnYouAction(claim.scope, claim.number, false))}>Not mine</button>{note(claim.id)}</>}</div>
    </>);
  };

  const member = view.mine.length > 0;
  return <div className="cs-oy-pair" ref={box}>
    <div className="cs-oy">
      <button className="cs-oy-pill" aria-expanded={open === 'gr'} aria-controls="cs-gr-panel" onClick={() => setOpen(open === 'gr' ? null : 'gr')}>Groups<span className="cs-oy-n q">{view.mine.length + going.length}</span></button>
      {open === 'gr' && <div className="cs-oy-drop" id="cs-gr-panel" role="region" aria-label="Your groups">
        <div className="cs-oy-head"><h2>Your groups</h2>{member && <Link className="cs-btn sm go" href="/groups/new">Start a group</Link>}</div>
        <div className="cs-oy-list cs-gr-list">
          {member && <><span className="cs-gr-sec">You belong to</span>{view.mine.map(group => <GroupRow key={group.id} href={group.href} mark={group.name} name={group.name} tag={group.inside ? `In ${group.inside}` : group.handle} inside={!!group.inside} faces={group.faces} picture={group.picture} people={group.people} on={group.on} line={group.next ?? 'Nothing waiting'} />)}</>}
          {going.length > 0 && <><span className="cs-gr-sec">You are going</span>{going.map(each => <GroupRow key={each.id} href={each.href} mark={each.title} name={each.title} tag="Outing" tone="out" faces={each.faces} people={each.people} line={[each.when, each.place].filter(Boolean).join(', ')} />)}</>}
        </div>
      </div>}
    </div>
    {member && <div className="cs-oy">
    <button className="cs-oy-pill" aria-expanded={open === 'oy'} aria-controls="cs-oy-panel" onClick={() => setOpen(open === 'oy' ? null : 'oy')}>On you{view.count + view.claims.length > 0 && <span className="cs-oy-n" key={view.count + view.claims.length}>{view.count + view.claims.length}</span>}</button>
    {open === 'oy' && <div className="cs-oy-drop" id="cs-oy-panel" role="region" aria-label="On you">
      <div className="cs-oy-head"><h2>On you</h2>{view.count > 0 && <span className="cs-oy-n">{view.count}</span>}
        {view.groups.length > 0 && <button className="cs-btn sm" aria-expanded={asking} onClick={() => setAsking(!asking)}>{asking ? 'Close' : 'Ask a group'}</button>}</div>
      {asking && <AskLine groups={view.groups} onAsked={() => setAsking(false)} />}
      {rows.length + claims.length > 0 ? <ul className="cs-oy-list">{claims.map(hand)}{rows.map(row)}</ul> : <p className="cs-oy-none">Nothing is waiting on you.</p>}
      {view.more > 0 && <p className="cs-oy-more">{view.more} more after these</p>}
    </div>}
    </div>}
  </div>;
}

/** One group, or one outing, in the Groups panel: the whole row opens its page. */
function GroupRow({ href, mark, name, tag, tone = '', inside = false, faces, picture = null, people, on = 0, line }: { href: string; mark: string; name: string; tag: string; tone?: string; inside?: boolean; faces: string[]; /** A group's drawn picture: shown in place of the faces, with the count laid over it. */ picture?: string | null; people: number; on?: number; line: string }) {
  return <Link className={`cs-gr-row ${inside ? 'in' : ''} ${tone}`} href={href}>
    <i className="cs-gr-mk" aria-hidden="true">{mark.trim().slice(0, 1).toUpperCase()}</i>
    <span className="cs-gr-name"><b>{name}</b><em>{tag}</em></span>
    <span className="cs-gr-end">{picture ? /* eslint-disable-next-line @next/next/no-img-element */
      <span className="cs-gr-pic"><img src={picture} alt="" />{people > 0 && <b>{people}<span className="cs-gr-sr"> people</span></b>}</span>
      : <>{faces.map((src, at) => /* eslint-disable-next-line @next/next/no-img-element */
      <img key={at} src={src} alt="" />)}{people > 0 && <small>{people}<span className="cs-gr-sr"> people</span></small>}</>}{on > 0 && <span className="cs-oy-n">{on}<span className="cs-gr-sr"> on you</span></span>}</span>
    <span className="cs-gr-line">{line}</span>
  </Link>;
}

const KINDS = [['done', 'Something to do'], ['one', 'Pick one'], ['text', 'Written answer']] as const;
type AskKind = typeof KINDS[number][0];
/** "2026-11-20T23:59" as "Fri 20 Nov, 11:59pm". */
function dueWords(due: string) {
  const at = new Date(`${due}:00Z`), hour = at.getUTCHours(), minute = at.getUTCMinutes();
  return `${at.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${hour % 12 || 12}:${String(minute).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
}

/** Asking a group in one line, like posting a plan: the group, the kind and the date are read out of the sentence and shown. */
function AskLine({ groups, onAsked }: { groups: OnYouGroup[]; onAsked: () => void }) {
  const [text, setText] = useState(''), [kind, setKind] = useState<AskKind | null>(null), [options, setOptions] = useState(''), [message, setMessage] = useState(''), [busy, start] = useTransition();
  const read = useMemo(() => {
    const tags = readDue(text, 'UTC', new Date()).tags, group = groups.find(each => tags.includes(each.tag)) ?? (groups.length === 1 ? groups[0] : null);
    return { group, ...readDue(text, group?.timezone ?? groups[0].timezone, new Date()) };
  }, [text, groups]);
  const guess: AskKind = /\b(which|vote|or)\b/i.test(read.title) ? 'one' : /\?$/.test(read.title) ? 'text' : 'done', now = kind ?? guess;
  const picks = options.split(',').map(part => part.trim()).filter(Boolean), { group, due, title } = read;
  const ready = !!group && !!due && !!title && (now !== 'one' || picks.length >= 2);
  const tag = (group: OnYouGroup) => setText(`${text.replace(/\s*@[a-z0-9-]*/gi, '').trim()} @${group.tag}`.trim());
  const send = () => { if (group && due) start(async () => {
    const result = await askGroupAction(group.scope, { question: title, kind: now, closesAt: due, ...(now === 'one' ? { options: picks } : {}) });
    if (result.ok) { setText(''); setOptions(''); setKind(null); setMessage(`Asked. It is on the list of everyone in ${group.name}.`); setTimeout(onAsked, 1600); } else setMessage(result.message);
  }); };
  return <div className="cs-oy-ask">
    <textarea aria-label="Ask a group in one line" placeholder="upload your W8 by friday @group" rows={2} value={text} onChange={event => { setText(event.target.value); setMessage(''); }} />
    <div className="cs-oy-read" aria-live="polite"><span className="kind">{KINDS.find(each => each[0] === now)![1]}</span>
      {group ? <span>{group.name}</span> : <span className="miss">Which group? Type @</span>}{due ? <span>{now === 'done' ? 'Due' : 'Closes'} {dueWords(due)}</span> : <span className="miss">By when?</span>}</div>
    <div className="cs-oy-pills" role="group" aria-label="Kind of answer">{KINDS.map(([key, label]) => <button key={key} aria-pressed={now === key} onClick={() => setKind(key)}>{label}</button>)}</div>
    {now === 'one' && <input aria-label="Options, separated by commas" placeholder="Options, separated by commas" value={options} onChange={event => setOptions(event.target.value)} />}
    {groups.length > 1 && <div className="cs-oy-pills" role="group" aria-label="Your groups">{groups.map(each => <button key={each.tag} aria-pressed={group === each} onClick={() => tag(each)}>@{each.tag}</button>)}</div>}
    <div className="cs-oy-act"><button className="cs-btn sm go" disabled={!ready || busy} onClick={send}>Ask the group</button>{message && <span className="cs-oy-note" role="status">{message}</span>}</div>
  </div>;
}
