'use client';

import { SeatsWord } from '@/components/loading/seats';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { postLineAction, readPlanLinkAction, type LineFrom } from '@/app/c/actions';
import { readLine, TIME_WORDS, typingTag, whenIdeas } from '@/lib/campus/line';
import type { NearTag } from '@/lib/campus/tags';
import { walkMinutes, type Point } from '@/lib/campus/sections';
import { dayLabel, localParts, timeLabel, zoned } from '@/lib/campus/time';
import type { Spot } from '@/lib/campus/view';

/** A plan already on the list with a tag, shown while a person posts with that tag, so they can look at it and join it instead. */
export type Soon = { id: string; tags: string[]; title: string; day: string; time: string; who: string; mine: boolean };

const people = (tag: NearTag) => `${tag.people} ${tag.people === 1 ? 'person' : 'people'} this week${tag.known.length ? ` · ${tag.known.join(', ')}` : ''}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The posting panel's place tabs (openspec campus-plan-place-and-time, design D5). */
export type PlaceTab = 'near' | Spot['kind'];
const TABS: [PlaceTab, string][] = [['near', 'Near you'], ['food', 'Food'], ['park', 'Parks'], ['sport', 'Sports'], ['building', 'Buildings']];
const KIND_NAME: Record<Spot['kind'], string> = { food: 'Food & drink', park: 'Parks', sport: 'Sports', building: 'Buildings & transit' };
const GLYPH: Record<Spot['kind'], React.ReactNode> = { food: <path d="M3 5h8v3a4 4 0 0 1-8 0zM11 6h1.5a1.5 1.5 0 0 1 0 3H11" />, park: <path d="M8 14V8M8 8c-3 0-4-2-4-5 3 0 4 2 4 5zm0 0c3 0 4-2 4-5-3 0-4 2-4 5z" />,
  sport: <><circle cx={8} cy={8} r={5} /><path d="M3 8h10M8 3c-2 2-2 8 0 10" /></>, building: <path d="M4 14V3h8v11M7 6h2M7 9h2M7 12h2" /> };
/** A name's letters alone, to match part of a name typed after an @: "@fi" finds Firefighters Field. */
const letters = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
/** What the posting panel tells the map: the place picked, and which places the open tab holds. */
export type Picking = { tag: string | null; shown: string[] };
const site = (link: string) => link.replace(/^https?:\/\//, '').split('/')[0];

/**
 * Posting in one line (design D12): the person types it the way they would text it, and sees what Loopd understood as
 * they type: what, when, and each @tag (openspec loop-campus-tags). Typing @ lists the tags people nearby use, by group. A pasted event link is read into
 * the line. The server reads the line again when it is posted, so what is shown here is never what is trusted.
 * It fills the panel the "+" on This week opens (design D13) with three rows, each one line (founder, 2026-11-18: wide, not
 * long): the line, what Loopd read, and what is nearby. The last row holds one thing at a time, and only the top few of it.
 */
export function Composer({ campus, tags, soon, onDone, onReview, spots = [], you = null, mapPick = null, onPicking, onMap, initial = '', onKeep }: { campus: { slug: string; name: string; tz: string }; tags: NearTag[]; soon: Soon[]; onDone: () => void;
  /** Opens a plan's own panel: where, when, who is going, and its own way in. Nobody joins a plan from here unseen (founder, 2026-11-18). */
  onReview: (id: string) => void;
  /** On a campus that requires places: where a plan may meet. Empty elsewhere, and posting is as before. */
  spots?: Spot[];
  /** Where the browser said the person stands, once the map asked: Near you is then the places closest to them. */
  you?: Point | null;
  /** A place dot pressed on the map: picked as its pill would be. `n` counts presses, so the same dot twice is two picks. */
  mapPick?: { tag: string; n: number } | null;
  onPicking?: (now: Picking) => void;
  /** On a phone: opens the map to pick on. */
  onMap?: () => void;
  /** Holds the line as it is typed, so the panel starts from it again when it is drawn somewhere else. */
  initial?: string; onKeep?: (text: string) => void }) {
  const router = useRouter(), box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(initial), [from, setFrom] = useState<LineFrom | null>(null), [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const latest = useRef(text);
  const [now] = useState(() => new Date()), [tried, setTried] = useState('');
  const [busy, start] = useTransition();

  const read = readLine(text, campus.tz, now), typing = typingTag(text);
  const title = read.title || from?.title || '', starts = read.starts ?? from?.starts ?? null;
  // The group a tag is counted with: found by its lead, or by any other tag of the group.
  const groupOf = (slug: string) => tags.find(tag => tag.slug === slug || tag.also.includes(slug));
  // Typing "@jog" finds the group led by @running, and offers the lead.
  const offered = (typing === null ? tags : tags.filter(tag => [tag.slug, ...tag.also].some(slug => slug.startsWith(typing)))).slice(0, 5);
  // Plans already on with one of the line's tags, or with a tag of the same group.
  const lead = (slug: string) => groupOf(slug)?.slug ?? slug, leads = typing === null ? read.tags.map(lead) : [];
  const here = soon.filter(plan => plan.tags.some(tag => leads.includes(lead(tag))));
  const say = (at: string) => {
    try {
      const then = zoned(campus.tz, at), far = then.getTime() - now.getTime() > 6 * 86400000, on = localParts(campus.tz, then).date;
      // A weekday alone is the coming one; further off, the date is said too.
      return `${dayLabel(campus.tz, then, now)} ${far ? `${MONTHS[Number(on.slice(5, 7)) - 1]} ${Number(on.slice(8))} ` : ''}${timeLabel(campus.tz, then)}`;
    } catch { return null; }
  };
  const when = starts ? say(starts) : null;
  // A day with no time (design D2): "Tue ?" until the people in it say when works.
  const dayName = dayLabel(campus.tz, zoned(campus.tz, `${read.day}T12:00`), now);

  // Where to meet, on a campus that requires it: the first @ that is a place, as the server reads it.
  const need = spots.length > 0, placeOf = (tag: string) => spots.find(spot => spot.tag === tag);
  const placed = need ? read.tags.map(placeOf).find(Boolean) ?? null : null;
  const [tab, setTab] = useState<PlaceTab>('near');
  const partial = need && typing && !placeOf(typing) ? typing : null, stray = need && !placed && typing === null ? read.tags[0] ?? null : null;
  const near = useMemo(() => [...spots].sort(you ? (a, b) => walkMinutes(you, [a.lon, a.lat]) - walkMinutes(you, [b.lon, b.lat]) || a.name.localeCompare(b.name) : (a, b) => b.used - a.used || a.name.localeCompare(b.name)).slice(0, 8), [spots, you]);
  const inBox = partial ? spots.filter(spot => spot.tag.startsWith(partial) || letters(spot.name).includes(letters(partial))) : tab === 'near' ? near : spots.filter(spot => spot.kind === tab);
  /** A pressed place (a pill or a dot) becomes the line's place @: in place of the one there, else of the @ being typed, else at the end. */
  const choose = (tag: string) => {
    setText(was => {
      const old = readLine(was, campus.tz, now).tags.find(each => spots.some(spot => spot.tag === each));
      if (old) return was.replace(new RegExp(`@${old}(?![a-z0-9-])`, 'i'), `@${tag}`).replace(/\s@[a-z0-9-]*$/i, ' ');
      return /@[a-z0-9-]*$/i.test(was) ? was.replace(/@[a-z0-9-]*$/i, `@${tag} `) : `${was.trimEnd()} @${tag} `.trimStart();
    });
    setSaid(null); box.current?.focus();
  };
  const seenPick = useRef(0);
  useEffect(() => { if (mapPick && mapPick.n !== seenPick.current) { seenPick.current = mapPick.n; choose(mapPick.tag); } });
  const shownTags = inBox.map(spot => spot.tag).join(' ');
  useEffect(() => { onPicking?.({ tag: placed?.tag ?? null, shown: shownTags ? shownTags.split(' ') : [] }); }, [placed?.tag, shownTags, onPicking]);
  // A line with no time is helped along, not refused: times to tap, and a time typed after an @ is offered as a time.
  const ideas = when ? [] : whenIdeas(text, campus.tz, now);
  const times = typing && typing.length >= 2 ? TIME_WORDS.filter(word => word.startsWith(typing)) : [];
  const add = (words: string) => { setText(now => `${now.trimEnd()} ${words} `.trimStart()); setSaid(null); box.current?.focus(); };
  const asTime = (word: string) => { setText(now => `${now.replace(/@[a-z0-9-]*$/i, word)} `); setSaid(null); box.current?.focus(); };

  // A link in the line is read once, as soon as it is there: its page becomes what the line says.
  const typed = (value: string) => {
    setText(value); setSaid(null);
    const link = readLine(value, campus.tz, now).link;
    if (!link || link === tried || !/\s$|^\S+$/.test(value)) return;
    setTried(link);
    start(async () => {
      const got = await readPlanLinkAction(campus.slug, link).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
      if (!got.ok) { setSaid({ text: got.message, bad: true }); return; }
      setFrom({ link: got.link, ...(got.filled ?? {}) });
      setText(now => now.replace(link, '').replace(/\s+/g, ' ').trimStart());
      setSaid({ text: got.filled ? `Read from ${site(got.link)}. Add an @tag if you like, then post it.` : got.note.replace('fill in the rest', 'say what it is and when'), bad: false });
      box.current?.focus();
    });
  };
  // A line the panel opens with is read as if just typed, so a link in it is read at once (the browser extension's
  // "Finish in Loopd" opens the panel with the event page's link, openspec loopd-browser-extension, design D6).
  const opened = useRef(false);
  useEffect(() => { if (!opened.current) { opened.current = true; if (initial) queueMicrotask(() => typed(initial)); } });
  // A picked tag finishes the @ being typed, or is added to the line when the line does not have it.
  const pick = (slug: string) => {
    setText(now => `${/@[a-z0-9-]*$/i.test(now) ? now.replace(/@[a-z0-9-]*$/i, `@${slug}`) : read.tags.includes(slug) ? now.trimEnd() : `${now.trimEnd()} @${slug}`.trimStart()} `.replace(/ +$/, ' '));
    box.current?.focus();
  };
  const post = () => need && !placed ? setSaid({ text: 'Where do you meet? Pick a place.', bad: false }) : start(async () => {
    const got = await postLineAction(campus.slug, text, from).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
    if (got.ok) { latest.current = ''; router.refresh(); onDone(); } else setSaid({ text: got.message, bad: true });
  });
  // The line is one row that grows with what is typed, so it never scrolls inside itself.
  useEffect(() => { const el = box.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } latest.current = text; }, [text]);
  // Handed back when the panel goes, and given again as `initial` where it is drawn next.
  useEffect(() => () => onKeep?.(latest.current), [onKeep]);
  // The third row: plans to join once the line has a tag they carry, else tags, while one is typed or people nearby use some.
  const joining = here.length > 0, tagging = !joining && (tags.length > 0 || typing !== null);
  const counted = read.tags.filter(tag => { const group = groupOf(tag); return group && group.slug !== tag; });

  return <div className="cs-post-rows">
    <div className="cs-post-row">
      <label className="cs-sr" htmlFor="cs-say">What are you up to?</label>
      <textarea id="cs-say" ref={box} className="cs-say" rows={1} maxLength={400} autoFocus spellCheck={false} placeholder="dumplings tonight 7 @collegetown" value={text}
        onChange={event => typed(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!busy) post(); } }} />
      <button type="button" className="cs-btn go" disabled={busy || (need && !placed)} onClick={post}><SeatsWord on={busy} word="Posting" plate>Post it</SeatsWord></button>
    </div>

    <div className="cs-read" aria-live="polite">
      {title && <span className="cs-chip">{title}</span>}
      {when ? <span className="cs-chip when">{when}</span> : title || from ? <><span className="cs-chip when open">{dayName} ?</span><span className="cs-chip-hint">People say when works, or add a time</span>{ideas.map(idea => <button key={idea.add} type="button" className="cs-chip idea" onClick={() => add(idea.add)}>{say(idea.starts)}</button>)}</>
        : <span className="cs-chip-hint">Say it the way you would text it, or paste an event link</span>}
      {typing === null && read.tags.map(tag => { const group = groupOf(tag); return <span key={tag} className={`cs-chip ${group ? 'place' : ''}`} title={group ? people(group) : 'A new tag, yours to name'}>@{tag}{group ? <i>{group.people}</i> : <small>new</small>}</span>; })}
      {typing === null && counted.map(tag => <span key={tag} className="cs-chip-hint">@{tag} is counted with @{groupOf(tag)!.slug}</span>)}
      {from && <span className="cs-chip">{site(from.link)}<button type="button" onClick={() => { setFrom(null); setSaid(null); }}>Remove link</button></span>}
      {said && <p role={said.bad ? 'alert' : 'status'} className={said.bad ? 'cs-line-bad' : 'cs-note'}>{said.text}</p>}
    </div>

    {need && <div className={`cs-where ${placed ? '' : 'ask'}`}>
      <span className={`cs-tile ${starts ? '' : 'open'}`}><small>{dayName}</small><b>{starts ? timeLabel(campus.tz, zoned(campus.tz, starts)) : '?'}</b></span>
      <span className="txt">{placed ? <>Meet at <b>{placed.name}</b></> : <b>Where do you meet?</b>}
        <small>{placed ? `@${placed.tag} · ${you ? `${walkMinutes(you, [placed.lon, placed.lat])} min walk from you` : KIND_NAME[placed.kind]}`
          : stray ? `@${stray} stays as a tag, but it is not a place on the map. Pick where to meet.` : 'Pick one below, type an @, or tap a dot on the map.'}</small></span>
      {onMap && <button type="button" className="cs-btn sm" onClick={onMap}>Pick on the map</button>}
    </div>}

    {need && !joining ? <div className="cs-pick">
      <div className="cs-kinds" role="group" aria-label="Places by kind">{partial
        ? <button type="button" aria-pressed="true">Matching @{partial}</button>
        : TABS.map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
      <div className="cs-box">
        {inBox.map(spot => <button key={spot.tag} type="button" className="cs-place" aria-pressed={placed?.tag === spot.tag} title={`@${spot.tag}`} onClick={() => choose(spot.tag)}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{GLYPH[spot.kind]}</svg><span>{spot.name}</span></button>)}
        {!inBox.length && <span className="cs-note">No place called @{partial} here. It can stay as a tag; pick where to meet once you finish the word.</span>}
      </div>
    </div> : <div className="cs-post-row near">
      {joining ? <>
        <h2>Already on</h2>
        {here.slice(0, 3).map(plan => <div className="cs-mini" key={plan.id}>
          <time>{plan.day}<br />{plan.time}</time>
          <div><b>{plan.title}</b><span>{plan.who}</span></div>
          {plan.mine ? <span className="cs-pill yes">You&rsquo;re in</span> : <button type="button" className="cs-btn sm cs-look" aria-label={`Look at ${plan.title}`} title="Look at this plan" onClick={() => onReview(plan.id)}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5l3.5 3.500" /></svg></button>}
        </div>)}
      </> : tagging ? <>
        <h2>{typing ? <>Starts with <b>@{typing}</b></> : 'Near you'}</h2>
        <div className="cs-sug">
          {times.map(word => <button key={word} type="button" className="new" onClick={() => asTime(word)}><b>{word}</b><small>A time, not a tag{say(readLine(word, campus.tz, now).starts ?? '') ? `: ${say(readLine(word, campus.tz, now).starts ?? '')}` : ''}</small></button>)}
          {offered.map(tag => <button key={tag.slug} type="button" title={people(tag)} onClick={() => pick(tag.slug)}><b>@{tag.slug}</b><i>{tag.people}</i></button>)}
          {typing !== null && typing.length >= 2 && !groupOf(typing) && !TIME_WORDS.includes(typing) && <button type="button" className="new" title="A new tag. People nearby see it when they type @" onClick={() => pick(typing)}><b>Make @{typing}</b></button>}
          {!offered.length && (typing ?? '').length < 2 && <span className="cs-note">{tags.length ? 'Keep typing to make a new tag.' : 'Nobody has made a tag here yet. Keep typing: it is yours to make.'}</span>}
        </div>
      </> : <span className="cs-note">Shows at {campus.name} at once. You are counted in.</span>}
    </div>}
  </div>;
}
