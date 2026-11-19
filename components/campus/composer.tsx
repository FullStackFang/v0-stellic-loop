'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { imInAction, postLineAction, readPlanLinkAction, type LineFrom } from '@/app/c/actions';
import { readLine, TIME_WORDS, typingTag, whenIdeas } from '@/lib/campus/line';
import type { NearTag } from '@/lib/campus/tags';
import { dayLabel, localParts, timeLabel, zoned } from '@/lib/campus/time';
import type { Face } from '@/lib/campus/view';
import { FaceDot } from './screen';

/** A plan already on the list at an @place, shown while a person posts there, so they can join it instead. */
export type Soon = { id: string; tag: string; title: string; day: string; time: string; who: string; faces: Face[]; mine: boolean };

const people = (tag: NearTag) => `${tag.people} ${tag.people === 1 ? 'person' : 'people'} this week${tag.known.length ? ` · ${tag.known.join(', ')}` : ''}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const site = (link: string) => link.replace(/^https?:\/\//, '').split('/')[0];

/**
 * Posting in one line (design D12): the person types it the way they would text it, and sees what Loop understood as
 * they type: what, when, and the @place. Typing @ lists the places people nearby use. A pasted event link is read into
 * the line. The server reads the line again when it is posted, so what is shown here is never what is trusted.
 * It fills the panel the "+" on This week opens (design D13): the line on the left, what other people are doing on the right.
 */
export function Composer({ campus, tags, soon, onDone }: { campus: { slug: string; name: string; tz: string }; tags: NearTag[]; soon: Soon[]; onDone: () => void }) {
  const router = useRouter(), box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(''), [from, setFrom] = useState<LineFrom | null>(null), [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [now] = useState(() => new Date()), [tried, setTried] = useState('');
  const [busy, start] = useTransition();

  const read = readLine(text, campus.tz, now), typing = typingTag(text);
  const title = read.title || from?.title || '', starts = read.starts ?? from?.starts ?? null;
  const place = read.tag ? tags.find(tag => tag.slug === read.tag) : undefined;
  const offered = (typing === null ? tags : tags.filter(tag => tag.slug.startsWith(typing))).slice(0, 5);
  // The busiest place fills its row; the others are drawn against it.
  const most = Math.max(1, ...tags.map(tag => tag.people));
  const here = read.tag && typing === null ? soon.filter(plan => plan.tag === read.tag) : [];
  const say = (at: string) => {
    try {
      const then = zoned(campus.tz, at), far = then.getTime() - now.getTime() > 6 * 86400000, on = localParts(campus.tz, then).date;
      // A weekday alone is the coming one; further off, the date is said too.
      return `${dayLabel(campus.tz, then, now)} ${far ? `${MONTHS[Number(on.slice(5, 7)) - 1]} ${Number(on.slice(8))} ` : ''}${timeLabel(campus.tz, then)}`;
    } catch { return null; }
  };
  const when = starts ? say(starts) : null;
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
      setSaid({ text: got.filled ? `Read from ${site(got.link)}. Add an @place if you like, then post it.` : got.note.replace('fill in the rest', 'say what it is and when'), bad: false });
      box.current?.focus();
    });
  };
  // A picked place finishes the @ being typed, or takes the place of the one the line has, or is added to the line.
  const pick = (slug: string) => {
    setText(now => `${/@[a-z0-9-]*$/i.test(now) ? now.replace(/@[a-z0-9-]*$/i, `@${slug}`) : read.tag ? now.replace(new RegExp(`@${read.tag}(?![a-z0-9-])`, 'i'), `@${slug}`) : `${now.trimEnd()} @${slug}`.trimStart()} `.replace(/ +$/, ' '));
    box.current?.focus();
  };
  const post = () => (title && !when ? setSaid({ text: 'When is it? Tap a time above, or type one.', bad: false }) : start(async () => {
    const got = await postLineAction(campus.slug, text, from).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
    if (got.ok) { router.refresh(); onDone(); } else setSaid({ text: got.message, bad: true });
  }));
  // The line is one row that grows with what is typed, so it never scrolls inside itself.
  useEffect(() => { const el = box.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }, [text]);
  // The second column is there only when it has something to show: places people use, a place being typed, or plans already on at the place.
  const side = tags.length > 0 || typing !== null || here.length > 0;
  const join = (id: string) => start(async () => { const got = await imInAction(id); if (got.ok) router.refresh(); else setSaid({ text: got.message, bad: true }); });

  return <div className="cs-post-cols">
    <div className="cs-line">
      <div className="cs-line-card">
        <label className="cs-line-label" htmlFor="cs-say">What are you up to?</label>
        <textarea id="cs-say" ref={box} className="cs-say" rows={1} maxLength={400} autoFocus spellCheck={false} placeholder="dumplings tonight 7 @collegetown" value={text}
          onChange={event => typed(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!busy) post(); } }} />
        <div className="cs-read" aria-live="polite">
          {title && <span className="cs-chip">{title}</span>}
          {when ? <span className="cs-chip when">{when}</span> : title || from ? <><span className="cs-chip-hint">When?</span>{ideas.map(idea => <button key={idea.add} type="button" className="cs-chip idea" onClick={() => add(idea.add)}>{say(idea.starts)}</button>)}</>
            : <span className="cs-chip-hint">Say it the way you would text it, or paste an event link</span>}
          {read.tag && typing === null && <span className={`cs-chip ${place ? 'place' : ''}`}>@{read.tag} · {place ? people(place) : 'a new place, yours to name'}</span>}
          {from && <span className="cs-chip">{site(from.link)}<button type="button" onClick={() => { setFrom(null); setSaid(null); }}>Remove link</button></span>}
        </div>
      </div>
      {said && <p role={said.bad ? 'alert' : 'status'} className={said.bad ? 'cs-line-bad' : 'cs-note'}>{said.text}</p>}
      <div className="cs-line-end">
        <button type="button" className="cs-btn go" disabled={busy} onClick={post}>{busy ? 'One moment…' : 'Post it'}</button>
        <span className="cs-note">Shows at {campus.name} at once. You are counted in.</span>
      </div>
    </div>

    {side && <div className="cs-post-side">
      <div className="cs-line-card">
        <h2>{typing ? <>Places near you that start with <b>@{typing}</b></> : 'Places people near you use'}</h2>
        <div className="cs-sug">
          {times.map(word => <button key={word} type="button" onClick={() => asTime(word)}><span><b className="new">{word}</b><small>A time, not a place{say(readLine(word, campus.tz, now).starts ?? '') ? `: ${say(readLine(word, campus.tz, now).starts ?? '')}` : ''}</small></span></button>)}
          {offered.map(tag => <button key={tag.slug} type="button" style={{ '--fill': tag.people / most } as React.CSSProperties} onClick={() => pick(tag.slug)}><span><b>@{tag.slug}</b><small>{people(tag)}</small></span></button>)}
          {typing !== null && typing.length >= 2 && !tags.some(tag => tag.slug === typing) && !TIME_WORDS.includes(typing) && <button type="button" onClick={() => pick(typing)}><span><b className="new">Make @{typing}</b><small>A new place. People nearby see it when they type @</small></span></button>}
          {!offered.length && (typing ?? '').length < 2 && <p className="cs-note">{tags.length ? 'Keep typing to name a new place.' : 'Nobody has named a place here yet. Keep typing: it is yours to make.'}</p>}
        </div>
      </div>

      {here.length > 0 && <div className="cs-line-card">
        <h2>Already on in <b>@{read.tag}</b></h2>
        {here.map(plan => <div className="cs-mini" key={plan.id}>
          <time>{plan.day}<br />{plan.time}</time>
          <div><b>{plan.title}</b><span>{plan.who}</span></div>
          {plan.faces.length > 0 && <span className="cs-stack">{plan.faces.slice(0, 3).map((face, at) => <FaceDot key={at} face={face} />)}</span>}
          {plan.mine ? <span className="cs-pill yes">You&rsquo;re in</span> : <button type="button" className="cs-btn sm" disabled={busy} onClick={() => join(plan.id)}>Join</button>}
        </div>)}
      </div>}
    </div>}
  </div>;
}
