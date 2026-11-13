'use client';

import Link from 'next/link';
import { startTransition, useActionState, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { CopyLink } from '@/components/emba/copy-link';
import { slugOf, sortInput, START_LIMITS } from '@/lib/emba/start-sort';
import { startGroupAction, type StartState } from '../start-actions';

export type StartNode = { id: string; parent: string | null; name: string; handle: string; namespace: string; canStart: boolean };

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const Chevron = ({ right }: { right?: boolean }) => <svg className="lp-ng-chev" viewBox="0 0 10 10" {...stroke}><path d={right ? 'M3.5 2l3 3-3 3' : 'M2 3.5l3 3 3-3'} /></svg>;
const Cross = () => <svg viewBox="0 0 10 10" {...stroke}><path d="M2 2l6 6M8 2l-6 6" /></svg>;
const TopIcon = () => <svg viewBox="0 0 14 14" {...stroke} strokeWidth={1.5}><path d="M2 12h10M7 9.5v-7M4 5l3-3 3 3" /></svg>;

// What the server will read: .txt and .md up to 256 KiB, text PDFs up to 3 MiB.
const readable = (file: File) => /\.(txt|md|pdf)$/i.test(file.name);
const tooBig = (file: File) => file.size > (/\.pdf$/i.test(file.name) ? 3 * 1024 * 1024 : 256 * 1024);
const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const idle: StartState = { status: 'idle' };

/** The start-a-group form: one header row for the name, the handle and where the group lives, then one box that sorts whatever is put into it. */
export function StartForm({ tree, canTop, initialParent }: { tree: StartNode[]; canTop: boolean; initialParent: string | null }) {
  const [state, submit, pending] = useActionState(startGroupAction, idle);
  const [name, setName] = useState('');
  const [typedSlug, setTypedSlug] = useState<string | null>(null);
  const [parent, setParent] = useState<string | null>(initialParent);
  const [look, setLook] = useState<string | null>(initialParent);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [over, setOver] = useState(false);
  const plate = useRef<HTMLDivElement>(null);

  const node = (id: string | null) => tree.find(item => item.id === id) ?? null;
  const kids = (id: string | null) => tree.filter(item => item.parent === id);
  const chain = (id: string | null) => { const up: StartNode[] = []; for (let at = node(id); at; at = node(at.parent)) up.unshift(at); return up; };
  const slug = typedSlug ?? slugOf(name);
  const inside = node(parent);
  const prefix = inside ? `@${inside.namespace}/` : '@';

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const click = (event: MouseEvent) => { if (!plate.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('keydown', key); document.addEventListener('mousedown', click);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', click); };
  }, [open]);

  /** Sorts typed or pasted text into the lanes. Returns the lanes as they will be, for a submit that sorts first. */
  function sort(raw: string) {
    const sorted = sortInput(raw);
    const next = {
      links: [...new Set([...links, ...sorted.links])].slice(0, START_LIMITS.links),
      people: [...new Set([...people, ...sorted.emails])].slice(0, START_LIMITS.people), note: [note, sorted.note].filter(Boolean).join('\n'),
    };
    setLinks(next.links); setPeople(next.people); setNote(next.note); setText('');
    const lost = links.length + sorted.links.length > START_LIMITS.links || people.length + sorted.emails.length > START_LIMITS.people;
    setNotice(lost ? `A new group starts with up to ${START_LIMITS.links} links and ${START_LIMITS.people} people. Add the rest from the group's pages.` : raw.trim() && !sorted.links.length && !sorted.emails.length && !sorted.note ? 'Nothing there Loop can keep. Links need to start with https.' : '');
    return next;
  }
  function addFiles(list: FileList | File[]) {
    const kept = [...files], refused: string[] = [];
    for (const file of list) {
      if (kept.some(item => item.name === file.name && item.size === file.size)) continue;
      if (!readable(file)) refused.push(`${file.name}: Loop reads .txt, .md and text PDFs. Share anything else as a link.`);
      else if (tooBig(file) || kept.length >= START_LIMITS.files || kept.reduce((sum, item) => sum + item.size, file.size) > START_LIMITS.bytes) refused.push(`${file.name} is too much to send with this form. Add it on the group's Resources page after the group is made.`);
      else kept.push(file);
    }
    setFiles(kept); setNotice(refused.join(' '));
  }
  const drop = (event: DragEvent) => { event.preventDefault(); setOver(false); if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files); };

  function create() {
    const lanes = text.trim() ? sort(text) : { links, people, note };
    const data = new FormData();
    data.set('name', name); data.set('slug', slug); data.set('parent', inside?.handle ?? ''); data.set('note', lanes.note);
    for (const link of lanes.links) data.append('link', link);
    for (const person of lanes.people) data.append('person', person);
    for (const file of files) data.append('file', file);
    startTransition(() => submit(data));
  }

  if (state.status === 'ready') return <Ready made={state} where={chain(parent).map(item => item.name)} />;

  const path = chain(look), levels = [null, ...path.map(item => item.id)].slice(-3);
  const mayPut = look === null ? canTop : node(look)!.canStart;
  const lane = (title: string, line: string, items: { key: string; label: string; meta?: string; remove: () => void }[]) => <div className={items.length ? 'lp-ng-lane' : 'lp-ng-lane lp-ng-zero'}>
    <h3>{title} <em>{items.length}</em></h3><p>{line}</p>
    {items.length > 0 && <ul>{items.map(item => <li key={item.key}><span><b>{item.label}</b>{item.meta && <small>{item.meta}</small>}</span><button type="button" className="lp-ng-x" aria-label={`Remove ${item.label}`} onClick={item.remove}><Cross /></button></li>)}</ul>}
  </div>;

  return <form className="lp-ng" onSubmit={event => { event.preventDefault(); if (name.trim() && slug.length >= 2 && !pending) create(); }}>
    <div className="lp-ng-plate" ref={plate}>
      <span className="lp-ng-mark"><Rings /></span>
      <div>
        <input className="lp-ng-name" value={name} onChange={event => setName(event.target.value)} placeholder="Name your group" aria-label="Group name" maxLength={200} required autoFocus />
        <div className="lp-ng-sub">
          <label className="lp-ng-handle"><span>{prefix}</span><input value={slug} onChange={event => setTypedSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 48))} placeholder="your-group" aria-label="Handle" size={Math.max(10, slug.length)} spellCheck={false} /></label>
          <button type="button" className="lp-ng-field" aria-expanded={open} onClick={() => { setLook(parent); setOpen(!open); }}>
            <span>Inside</span><b>{inside ? chain(parent).map(item => item.name).join(' › ') : 'Top level, on its own'}</b><Chevron />
          </button>
        </div>
      </div>
      {open && <div className="lp-ng-pop" role="dialog" aria-label="Where the group lives">
        <div className="lp-ng-cols">{[0, 1, 2].map(index => {
          const at = levels[index];
          if (at === undefined) return <div key={index} className="lp-ng-col" />;
          const options = kids(at);
          return <div key={index} className="lp-ng-col"><h3>{at ? `Inside ${node(at)!.name}` : 'Your groups'}</h3>
            {at === null && canTop && <button type="button" className={look === null ? 'lp-ng-opt lp-ng-on' : 'lp-ng-opt'} onClick={() => setLook(null)}><span className="lp-ng-g lp-ng-top"><TopIcon /></span><span><b>Top level, on its own</b><small>Only people you invite</small></span></button>}
            {options.map(option => <button key={option.id} type="button" className={option.id === look ? 'lp-ng-opt lp-ng-on' : path.some(item => item.id === option.id) ? 'lp-ng-opt lp-ng-via' : 'lp-ng-opt'} onClick={() => setLook(option.id)}>
              <span className="lp-ng-g"><Rings /></span><span><b>{option.name}</b><small>{option.handle}</small></span>{kids(option.id).length > 0 && <Chevron right />}
            </button>)}
            {at !== null && options.length === 0 && <p className="lp-ng-empty">Nothing inside yet. The new group would be the first.</p>}
          </div>;
        })}</div>
        <div className="lp-ng-foot">
          <span>{look === null ? <>Goes at the <b>top level</b>. Only people you invite can open it.</>
            : mayPut ? <>Goes inside <b>{path.map(item => item.name).join(' › ')}</b>. Everyone in {node(look)!.name} can open it. It keeps its own files, dates and asks.</>
            : <>Only the organizers of <b>{node(look)!.name}</b> can start a group there.</>}</span>
          <button type="button" disabled={!mayPut || look === parent} onClick={() => { setParent(look); setOpen(false); }}>{look === parent ? 'Chosen' : 'Put it here'}</button>
        </div>
      </div>}
    </div>

    <div className={over ? 'lp-ng-box lp-ng-over' : 'lp-ng-box'} onDragOver={event => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <textarea value={text} onChange={event => setText(event.target.value)} aria-label="Add anything"
        placeholder={`Drop files here, or paste anything: links, emails, a note to the group. Loop sorts it.`}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (text.trim()) sort(text); } }} />
      <div className="lp-ng-boxfoot">
        <label className="lp-ng-pill">Choose files<input type="file" multiple hidden accept=".txt,.md,.pdf" onChange={event => { if (event.target.files) addFiles(event.target.files); event.target.value = ''; }} /></label>
        <span>Enter sorts what you typed. Shift and Enter makes a new line.</span>
      </div>
      {notice && <p className="lp-ng-notice" role="status">{notice}</p>}
    </div>

    <div className="lp-ng-lanes">
      {lane('Files', 'Loop keeps a copy of the text.', files.map(file => ({ key: `${file.name} ${file.size}`, label: file.name, meta: size(file.size), remove: () => setFiles(files.filter(item => item !== file)) })))}
      {lane('Links', 'Address and title only. Your assistant opens them with your own access.', links.map(link => ({ key: link, label: link.replace(/^https:\/\//, ''), remove: () => setLinks(links.filter(item => item !== link)) })))}
      {lane('People', 'Invited as members. Loop does not email them: they see the invitation when they sign in with this address.', people.map(person => ({ key: person, label: person, remove: () => setPeople(people.filter(item => item !== person)) })))}
    </div>

    {note && <div className="lp-ng-say"><h3>First announcement</h3><textarea value={note} onChange={event => setNote(event.target.value)} aria-label="First announcement" rows={Math.min(6, note.split('\n').length + 1)} maxLength={600} /></div>}

    <div className="lp-ng-go">
      <button type="submit" className="lp-ng-create" disabled={!name.trim() || slug.length < 2 || pending}>{pending ? 'Creating…' : 'Create group'}</button>
      {state.status === 'error' ? <p role="alert">{state.message}</p> : <p>Only the name is needed. Everything else can be added later.</p>}
    </div>
  </form>;
}

function Ready({ made, where }: { made: Extract<StartState, { status: 'ready' }>; where: string[] }) {
  // This view is only ever drawn in the browser, after the action answers, so the link can be shown whole, ready to paste.
  const join = made.joinToken ? `${typeof window === 'undefined' ? '' : window.location.origin}/groups/request#token=${made.joinToken}` : null;
  const { files, links, people, announcement } = made.added;
  const row = (label: string, body: ReactNode) => <div><dt>{label}</dt><dd>{body}</dd></div>;
  return <section className="lp-ng lp-ng-ready" aria-labelledby="ready-title">
    <div className="lp-ng-plate lp-ng-made">
      <span className="lp-ng-mark"><Rings /></span>
      <div><p className="lp-ng-kick">Your group is ready</p><h1 id="ready-title">{made.name}</h1>
        <p className="lp-ng-sub"><span className="lp-ng-handle">{made.handle}</span><span>{where.length ? `Inside ${where.join(' › ')}` : 'Top level, on its own'}</span></p></div>
      <Link className="lp-ng-create" href={`${made.href}/team`}>Open the group</Link>
    </div>
    <dl className="lp-ng-facts">
      {row('Join link', join ? <><input readOnly value={join} aria-label="Join link" onFocus={event => event.target.select()} /><CopyLink url={join} /><small>Anyone with this link can ask to join. It is shown once: copy it now. You can make a new one on the Members page.</small></> : <small>Turn the join link on from the Members page.</small>)}
      {row('Your assistant', <><Link href="/groups/connections">Connect an assistant</Link><small>Once connected it reads this group before it drafts anything for it.</small></>)}
      {announcement && row('First announcement', announcement)}
      {files.length > 0 && row('Files', files.join(', '))}
      {links.length > 0 && row('Links', links.map(link => link.replace(/^https:\/\//, '')).join(', '))}
      {people.length > 0 && row('Invited', <>{people.join(', ')}<small>They see the invitation when they sign in with that address. Loop does not email them.</small></>)}
    </dl>
    {made.failed.length > 0 && <div className="lp-ng-failed" role="alert"><h2>Not added</h2><ul>{made.failed.map(item => <li key={item.what}><b>{item.what}</b> {item.why}</li>)}</ul></div>}
  </section>;
}
