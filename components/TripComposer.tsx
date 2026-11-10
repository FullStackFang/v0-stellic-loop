'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { emptyTripDraft, mergeExtraction, MENTIONS, setDraftField, type DraftSource, type TripDraft, type TripWorkspace } from '@/lib/trip-draft';
import './TripComposer.css';

type LocalWorkspace = TripWorkspace & { token: string };
const tokenKey = (id: string) => `loop:trip:edit:${id}`;
const request = (url: string, token: string, init?: RequestInit) => fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } });
const sourceTitle = (source?: DraftSource) => source?.kind === 'text' ? `From your message, characters ${source.range[0] + 1}–${source.range[1]}` : source ? `From document page ${source.page}` : undefined;

function DraftInput({ path, label, value, placeholder, draft, pins, onEdit, onClear }: {
  path: string; label: string; value: string; placeholder: string; draft: TripDraft; pins: Record<string, string>;
  onEdit: (path: string, value: string) => void; onClear: (path: string) => void;
}) {
  const [showSource, setShowSource] = useState(false);
  return <div className="tc-field" title={sourceTitle(draft.sources[path])}>
    <span>{label}{draft.sources[path] && <button className="tc-source" type="button" aria-label={`Show source for ${label}`} onClick={e => { e.preventDefault(); setShowSource(!showSource); }}>·</button>}</span>
    <span className="tc-input-wrap"><input aria-label={label} data-draft-path={path} value={value} placeholder={placeholder} onChange={e => onEdit(path, e.target.value)} />
      {path in pins && <button type="button" className="tc-clear" onClick={() => onClear(path)} title="Clear manual edit">×</button>}</span>
    {showSource && draft.sources[path] && <small className="tc-source-note">{sourceTitle(draft.sources[path])}</small>}
  </div>;
}

function caretOffset(el: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !el.contains(selection.anchorNode)) return el.textContent?.length ?? 0;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(el); range.setEnd(selection.anchorNode!, selection.anchorOffset);
  return range.toString().length;
}
function placeCaret(el: HTMLElement, offset: number) {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walk.nextNode())) {
    const size = node.textContent?.length ?? 0;
    if (offset <= size) { const range = document.createRange(); range.setStart(node, offset); range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); return; }
    offset -= size;
  }
  el.focus();
}
function paintWriter(el: HTMLElement, writer: string, sources: Record<string, DraftSource>) {
  const offset = document.activeElement === el ? caretOffset(el) : -1;
  const marks = Object.entries(sources).filter((entry): entry is [string, Extract<DraftSource, { kind: 'text' }>] => entry[1].kind === 'text')
    .sort((a, b) => a[1].range[0] - b[1].range[0]);
  const fragment = document.createDocumentFragment(); let cursor = 0;
  for (const [path, source] of marks) {
    const [from, to] = source.range;
    if (from < cursor || to > writer.length || to <= from) continue;
    fragment.append(document.createTextNode(writer.slice(cursor, from)));
    const span = document.createElement('span'); span.className = 'tc-entity'; span.dataset.path = path;
    span.textContent = writer.slice(from, to); fragment.append(span); cursor = to;
  }
  fragment.append(document.createTextNode(writer.slice(cursor)));
  el.replaceChildren(fragment);
  if (offset >= 0) placeCaret(el, Math.min(offset, writer.length));
}

export function TripComposer({ mode, id }: { mode: 'new' | 'edit'; id?: string }) {
  const router = useRouter();
  const [work, setWork] = useState<LocalWorkspace | null>(null);
  const [saveState, setSaveState] = useState('Saving…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mention, setMention] = useState<{ query: string; offset: number; x: number; y: number } | null>(null);
  const [parseTick, setParseTick] = useState(0);
  const writerRef = useRef<HTMLDivElement>(null), writerBoxRef = useRef<HTMLDivElement>(null), fileRef = useRef<HTMLInputElement>(null), coverRef = useRef<HTMLInputElement>(null);
  const current = useRef<LocalWorkspace | null>(null), revision = useRef(0), parsedInput = useRef(''), parsedSeq = useRef(0);

  const update = useCallback((change: (w: LocalWorkspace) => LocalWorkspace) => {
    setWork(prev => {
      if (!prev) return prev;
      const next = change(prev); current.current = next; setSaveState('Saving…'); return next;
    });
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let workspaceId = id || (mode === 'new' ? localStorage.getItem('loop:trip:current') : null);
        let token = workspaceId ? localStorage.getItem(tokenKey(workspaceId)) : null;
        let response = workspaceId && token ? await request(`/api/trips/${workspaceId}`, token) : null;
        if ((!response || !response.ok) && mode === 'new') {
          response = await fetch('/api/trips', { method: 'POST' });
          if (!response.ok) throw Error('Could not start a draft.');
          const made = await response.json() as { id: string; token: string };
          workspaceId = made.id; token = made.token;
          localStorage.setItem('loop:trip:current', made.id);
          localStorage.setItem(tokenKey(made.id), made.token);
          response = await request(`/api/trips/${made.id}`, made.token);
        }
        if (!response?.ok || !token) throw Error(mode === 'edit' ? 'This edit link is unavailable on this device.' : 'Could not load the draft.');
        const loaded = await response.json() as TripWorkspace;
        if (cancelled) return;
        const next = { ...loaded, token }; current.current = next; revision.current = loaded.revision;
        setWork(next); setSaveState('Draft saved');
        if (writerRef.current) writerRef.current.textContent = loaded.writer;
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the draft.'); }
    }
    load(); return () => { cancelled = true; };
  }, [id, mode]);

  useEffect(() => {
    if (!work) return;
    const timeout = window.setTimeout(async () => {
      const latest = current.current;
      if (!latest) return;
      const nextRevision = ++revision.current;
      try {
        const response = await request(`/api/trips/${latest.id}`, latest.token, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ writer: latest.writer, draft: latest.draft, pins: latest.pins, revision: nextRevision }) });
        if (!response.ok) throw Error();
        if (current.current === latest) setSaveState('Draft saved');
      } catch { setSaveState('Could not save'); }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [work]);

  useEffect(() => {
    if (!work) return;
    const fingerprint = work.writer + '\0' + work.draft.documents.map(d => d.id).join(',') + '\0' + parseTick;
    if (parsedInput.current === fingerprint || (!work.writer && !work.draft.documents.length)) return;
    const seq = ++parsedSeq.current;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await request(`/api/trips/${work.id}/parse`, work.token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ writer: work.writer }) });
        const body = await response.json();
        if (seq !== parsedSeq.current) return;
        parsedInput.current = fingerprint;
        if (!body.draft) return;
        update(w => ({ ...w, draft: mergeExtraction(w.draft, body.draft as TripDraft, w.pins) }));
      } catch { /* Parser failures leave the draft untouched. */ }
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [work, parseTick, update]);

  useEffect(() => {
    if (!work || !writerRef.current || document.activeElement === writerRef.current && writerRef.current.textContent !== work.writer) return;
    paintWriter(writerRef.current, work.writer, work.draft.sources);
  }, [work?.draft.sources, work?.writer, work]);

  function edit(path: string, value: string) {
    update(w => ({ ...w, draft: setDraftField(w.draft, path, value), pins: { ...w.pins, [path]: value } }));
  }
  function clear(path: string) { update(w => { const pins = { ...w.pins }; delete pins[path]; return { ...w, pins }; }); setParseTick(n => n + 1); }
  function onWriterInput() {
    const el = writerRef.current, box = writerBoxRef.current;
    if (!el || !box) return;
    const text = el.textContent ?? '', offset = caretOffset(el);
    update(w => ({ ...w, writer: text }));
    const match = text.slice(0, offset).match(/@([a-z]*)$/i);
    if (!match) return setMention(null);
    const selection = window.getSelection(), rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const boxRect = box.getBoundingClientRect();
    setMention({ query: match[1].toLowerCase(), offset, x: (rect?.left ?? boxRect.left) - boxRect.left, y: (rect?.bottom ?? boxRect.top + 40) - boxRect.top + 5 });
  }
  function selectMention(value: string) {
    const w = current.current, el = writerRef.current;
    if (!w || !el || !mention) return;
    const from = mention.offset - mention.query.length - 1;
    const writer = w.writer.slice(0, from) + `@${value} ` + w.writer.slice(mention.offset);
    el.textContent = writer; el.focus(); placeCaret(el, from + value.length + 2);
    update(old => ({ ...old, writer })); setMention(null);
  }
  async function upload(file: File) {
    const w = current.current; if (!w) return;
    setError('');
    const data = new FormData(); data.set('file', file);
    try {
      const response = await request(`/api/trips/${w.id}/documents`, w.token, { method: 'POST', body: data });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Could not upload the file.');
      update(old => ({ ...old, draft: { ...old.draft, documents: [...old.draft.documents, body.document] } }));
      setParseTick(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not upload the file.'); }
  }
  async function openDocument(docId: string) {
    const w = current.current; if (!w) return;
    const response = await request(`/api/trips/${w.id}/documents/${docId}`, w.token);
    if (!response.ok) return setError('Could not open the document.');
    const url = URL.createObjectURL(await response.blob());
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function uploadCover(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) return setError('Choose a JPG, PNG, or WebP cover under 1 MB.');
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') update(w => ({ ...w, draft: { ...w.draft, cover: reader.result as string } })); };
    reader.readAsDataURL(file);
  }
  async function publish() {
    const w = current.current; if (!w || busy) return;
    setBusy(true); setError('');
    try {
      const nextRevision = ++revision.current;
      const save = await request(`/api/trips/${w.id}`, w.token, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writer: w.writer, draft: w.draft, pins: w.pins, revision: nextRevision }) });
      if (!save.ok) throw Error('Could not save the trip.');
      if (mode === 'edit') { setSaveState('Draft saved'); return; }
      const response = await request(`/api/trips/${w.id}`, w.token, { method: 'POST' });
      if (!response.ok) throw Error('Could not create the trip.');
      const { slug } = await response.json();
      localStorage.removeItem('loop:trip:current');
      router.push(`/trip/${slug}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the trip.'); }
    finally { setBusy(false); }
  }

  const d = work?.draft ?? emptyTripDraft(), pins = work?.pins ?? {};
  const field = (path: string, label: string, value: string, placeholder: string) => <DraftInput path={path} label={label} value={value} placeholder={placeholder} draft={d} pins={pins} onEdit={edit} onClear={clear} />;
  return <div className="tc-page">
    <header className="tc-header"><Link href="/" className="tc-logo">Loop</Link><span className="tc-save" aria-live="polite">{saveState}</span><Link href={work?.slug ? `/trip/${work.slug}` : '/'} className="tc-cancel">Cancel</Link></header>
    <main className="tc-layout">
      <section className="tc-compose">
        <input className="tc-name" aria-label="Trip name" placeholder="TRIP NAME" value={d.name} onChange={e => update(w => ({ ...w, draft: { ...w.draft, name: e.target.value } }))} maxLength={60} />
        <div className="tc-writer-box" ref={writerBoxRef} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) upload(file); }}>
          <div ref={writerRef} className="tc-writer" role="textbox" aria-label="Trip message" aria-multiline="true" data-placeholder="Write it like a message. Dates, places and @mentions fill the draft." contentEditable suppressContentEditableWarning onInput={onWriterInput} onBeforeInput={e => {
            if (e.nativeEvent.inputType !== 'insertParagraph') return;
            e.preventDefault(); const selection = window.getSelection(); if (!selection?.rangeCount) return;
            const range = selection.getRangeAt(0); range.deleteContents(); const node = document.createTextNode('\n'); range.insertNode(node);
            range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); onWriterInput();
          }} onKeyDown={e => { if (e.key === 'Escape') setMention(null); if (e.key === 'Enter' && mention && MENTIONS.some(v => v.startsWith(mention.query))) { e.preventDefault(); selectMention(MENTIONS.find(v => v.startsWith(mention.query))!); } }} onClick={e => {
            const target = e.target as HTMLElement, path = target.dataset.path;
            if (path) document.querySelector<HTMLInputElement>(`[data-draft-path="${path}"]`)?.focus();
          }} />
          {mention && <div className="tc-mentions" style={{ left: Math.min(mention.x, 250), top: mention.y }} role="listbox" aria-label="Trip fields">
            {MENTIONS.filter(v => v.startsWith(mention.query)).map(v => <button type="button" role="option" aria-selected="false" key={v} onMouseDown={e => e.preventDefault()} onClick={() => selectMention(v)}>@{v}</button>)}
          </div>}
          <div className="tc-writer-footer"><button type="button" onClick={() => fileRef.current?.click()}>＋ <span>Drop syllabus or docs</span></button><input ref={fileRef} type="file" accept=".pdf,.txt,.png,.jpg,.jpeg" hidden onChange={e => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ''; }} /><span>Write freely. Edit the draft anytime.</span></div>
        </div>
        {error && <p className="tc-error" role="alert">{error}</p>}
      </section>
      <aside className="tc-draft">
        <div className="tc-draft-heading"><strong>Draft</strong><span>updates as you write · click to edit</span></div>
        <div className="tc-card">
          <div className="tc-cover"><span>Cover</span>{d.cover ? <Image src={d.cover} alt="Trip cover" fill unoptimized sizes="440px" /> : null}<button className="tc-cover-upload" type="button" onClick={() => coverRef.current?.click()}>{d.cover ? 'Change cover' : 'Add a cover'}</button><input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const file = e.target.files?.[0]; if (file) uploadCover(file); e.target.value = ''; }} />{field('cover', 'Image URL', d.cover.startsWith('data:') ? '' : d.cover, 'Or paste an image URL')}</div>
          <div className="tc-block tc-dates"><div className="tc-block-title">Dates</div><div className="tc-timeline"><span className="tc-dot"/><span className="tc-line"/><span className="tc-dot"/></div><div className="tc-date-fields">
            <div className="tc-date-pair">{field('start', 'Start', d.start, 'Add date')}{field('startTime', 'Time', d.startTime, 'Add time')}</div>
            <div className="tc-date-pair">{field('end', 'End', d.end, 'Add date')}{field('endTime', 'Time', d.endTime, 'Add time')}</div>
          </div>{field('timezone', 'Timezone', d.timezone, 'From first place')}</div>
          <div className="tc-block"><div className="tc-block-title">Places <button type="button" onClick={() => update(w => ({ ...w, pins: { ...w.pins, [`places.${w.draft.places.length}.name`]: '' }, draft: { ...w.draft, places: [...w.draft.places, { id: crypto.randomUUID(), name: '', from: '', to: '', hotel: '' }] } }))}>＋ Add</button></div>
            {d.places.length ? d.places.map((place, i) => <div className="tc-place" key={place.id}>{field(`places.${i}.name`, `Place ${i + 1}`, place.name, 'Add place')}<div className="tc-pair">{field(`places.${i}.from`, 'From', place.from, 'date?')}{field(`places.${i}.to`, 'To', place.to, 'date?')}</div>{field(`places.${i}.hotel`, 'Hotel', place.hotel, 'hotel?')}</div>) : <p className="tc-empty">Add a place</p>}
          </div>
          <div className="tc-block"><div className="tc-block-title">Options</div>{field('joinRule.label', 'Who can join', d.joinRule.label, 'Anyone with the link')}{field('joinRule.domain', 'Email domain', d.joinRule.domain, 'No domain rule')}
            <div className="tc-subhead">Optional <button type="button" onClick={() => update(w => ({ ...w, pins: { ...w.pins, [`optional.${w.draft.optional.length}.label`]: '' }, draft: { ...w.draft, optional: [...w.draft.optional, { id: crypto.randomUUID(), label: '', date: '', cost: '', min: '', deadline: '' }] } }))}>＋ Add</button></div>
            {d.optional.length ? d.optional.map((item, i) => <div className="tc-optional" key={item.id}>{field(`optional.${i}.label`, `Item ${i + 1}`, item.label, 'Optional plan')}<div className="tc-pair">{field(`optional.${i}.date`, 'Date', item.date, 'date?')}{field(`optional.${i}.cost`, 'Cost', item.cost, 'cost?')}</div><div className="tc-pair">{field(`optional.${i}.min`, 'Minimum', item.min, 'min?')}{field(`optional.${i}.deadline`, 'Deadline', item.deadline, 'deadline?')}</div></div>) : <p className="tc-empty">None yet</p>}
            <div className="tc-subhead">Documents <span>{d.documents.length || 'none yet'}</span></div>
            {d.documents.map(doc => <button type="button" className="tc-document" key={doc.id} onClick={() => openDocument(doc.id)}>{doc.name}</button>)}
            <details className="tc-screening"><summary>Screening questions + confirm message <span>defaults ✎</span></summary>
              {d.screening.questions.map((question, i) => <label className="tc-field" key={i}><span>Yes / no question {i + 1}</span><input value={question} onChange={e => update(w => { const next = structuredClone(w.draft); next.screening.questions[i] = e.target.value; return { ...w, draft: next }; })} /></label>)}
              <label className="tc-field"><span>Confirm message</span><input value={d.screening.confirmMessage} onChange={e => update(w => ({ ...w, draft: { ...w.draft, screening: { ...w.draft.screening, confirmMessage: e.target.value } } }))} /></label>
            </details>
          </div>
        </div>
        <button className="tc-primary" type="button" onClick={publish}>{busy ? 'Saving…' : mode === 'new' ? 'Create trip' : 'Save'} <span>→</span></button>
      </aside>
    </main>
  </div>;
}
