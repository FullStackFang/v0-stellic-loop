'use client';

import { SeatsWord } from '@/components/loading/seats';
import { useActionState, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { PortalAction, PortalResult } from './portal-types';

const initial: PortalResult = { status: 'idle', message: '' };
export const FILE_TYPES = '.pdf,.txt,.md,.docx';

/** What what is in the box will become, decided the way the server decides it again: a file, an https link, a refused address, or words. */
export type Sorted = { type: 'file'; file: File } | { type: 'link'; host: string } | { type: 'bad' } | { type: 'text' } | null;
export function sortBox(value: string, file: File | null): Sorted {
  if (file) return { type: 'file', file };
  const text = value.trim();
  if (!text) return null;
  if (/^https:\/\/[^\s.]+\.\S+$/i.test(text)) { try { return { type: 'link', host: new URL(text).hostname.replace(/^www\./, '') }; } catch { return { type: 'text' }; } }
  if (/^(http:\/\/|www\.)\S+$/i.test(text)) return { type: 'bad' };
  return { type: 'text' };
}
const size = (bytes: number) => bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
const tile = (kind: 'link' | 'text') => <span className={`lp-tile${kind === 'text' ? ' lp-tile-text' : ''}`} aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{kind === 'link' ? <path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a3 3 0 0 1 4.5 4.5l-1 1M9 11.5l-1 1A3 3 0 0 1 3.5 8l1-1" /> : <path d="M3 4.5h10M3 8h10M3 11.5h6" />}</svg></span>;

/**
 * The one box of the Resources tab. What is put in decides what it becomes, and the box says so before anything is saved:
 * an https address is a link, other words are a text, and a file is read for its words and not kept. The only field is an
 * optional name. It works with a keyboard alone (Choose a file is a real control) and takes a dropped file as well.
 */
export function ResourceBox({ action, orgId, loopId }: { action: PortalAction; orgId: string; loopId: string }) {
  const [state, submit, pending] = useActionState(action, initial);
  const [text, setText] = useState(''), [file, setFile] = useState<File | null>(null), [name, setName] = useState(''), [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null), box = useRef<HTMLTextAreaElement>(null), form = useRef<HTMLFormElement>(null);
  const sorted = sortBox(text, file);
  // A saved resource empties the box; a refused one leaves what was put in, so it can be corrected.
  useEffect(() => { if (state.status === 'success') { setText(''); setFile(null); setName(''); if (fileInput.current) fileInput.current.value = ''; } }, [state]);
  const take = (picked: File | null) => { setFile(picked); if (picked) setText(''); };
  const drop = (event: DragEvent) => {
    event.preventDefault(); setOver(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) { try { const data = new DataTransfer(); data.items.add(dropped); if (fileInput.current) fileInput.current.files = data.files; } catch { /* the file is still held in state */ } take(dropped); }
    else { const words = event.dataTransfer.getData('text'); if (words) { setFile(null); setText(words); } }
  };
  const enter = (event: KeyboardEvent) => { if (event.key === 'Enter' && !event.shiftKey && sorted?.type === 'link') { event.preventDefault(); form.current?.requestSubmit(); } };
  return <form ref={form} action={submit} className={`lp-compose${over ? ' lp-compose-drag' : ''}`}
    onDragOver={event => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
    <input type="hidden" name="orgId" value={orgId} /><input type="hidden" name="loopId" value={loopId} />
    <button type="button" className="lp-plus" aria-label="Add a link, a file or text" onClick={() => box.current?.focus()}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg></button>
    <textarea ref={box} name="body" rows={1} aria-label="Add to resources" placeholder="Paste a link, drop a file, or paste text. Loopd works out which." value={text} onKeyDown={enter}
      onChange={event => { setText(event.target.value); if (event.target.value) setFile(null); if (fileInput.current && event.target.value) fileInput.current.value = ''; }} />
    <label className="lp-pickfile">Choose a file<input ref={fileInput} type="file" name="file" accept={FILE_TYPES} className="lp-sr" onChange={event => take(event.target.files?.[0] ?? null)} /></label>
    {sorted && <div className="lp-detect">
      {sorted.type === 'bad' ? <p className="lp-err" role="alert">Links need to start with https.</p> : <>
        <div className="lp-found">{tile(sorted.type === 'link' ? 'link' : 'text')}<div><b>{sorted.type === 'link' ? 'Link' : sorted.type === 'file' ? 'File' : 'Text'}</b><small>{sorted.type === 'link' ? sorted.host : sorted.type === 'file' ? `${sorted.file.name} · ${size(sorted.file.size)}` : 'Searchable by assistants'}</small></div></div>
        <label className="lp-field">Name (optional)<input name="name" maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder={sorted.type === 'file' ? sorted.file.name.replace(/\.[a-z0-9]+$/i, '') : sorted.type === 'link' ? 'Left as the address' : 'Interview transcript'} /></label>
        <p className="lp-hint">{sorted.type === 'link' ? 'Nothing else to fill in. An assistant works out what it is for, and for whom, when it first reads it.' : sorted.type === 'file' ? 'Loopd reads the words and does not keep the file. An assistant tags it when it first reads it.' : 'Kept as pasted. An assistant tags it when it first reads it.'}</p>
        <button className="lt-primary" type="submit" disabled={pending}>{pending ? <SeatsWord word="Saving" plate /> : sorted.type === 'link' ? 'Add link' : 'Add text'}</button></>}
    </div>}
    {state.message && <p className={state.status === 'error' ? 'lp-err' : 'emba-meta'} role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
  </form>;
}
