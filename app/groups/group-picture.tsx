'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { InkMark, SchoolMark } from '@/components/campus/ink-mark';
import { SaveFace } from '@/components/campus/save-face';
import { joinedWords } from '@/lib/campus/ink';
import type { Choice, Pick, PicturePane, TileProps } from '@/lib/emba/group-picture';
import { groupPictureSrc } from '@/lib/emba/group-picture-src';
import { drawGroupPictureAction, keepGroupPictureAction } from './picture-actions';
import { GetInk } from '@/components/campus/join-plan';
import './group-picture.css';
import { SeatsTicket } from '@/components/loading/seats';
import { PicturesWait } from '@/components/loading/pictures-wait';

// A group's tile, and the card that draws its picture (openspec loop-group-picture; the look and the steps are
// public/demo/mockups-group-picture-place.html, A). The card wears the classes of the account card's animal picker
// and its Ink plate (app/c/campus.css), so it follows them. Every rule is checked again on the server.

const keyOf = (pick: Pick) => 'face' in pick ? `f${pick.face}` : `t${pick.token}`;
const FAILED = { ok: false as const, message: 'That did not go through. Try again.' };
const FILTERS: [Choice['kind'], string][] = [['own', 'Yours'], ['school', 'Schools'], ['ink', 'Ink']];
type Step = 'pics' | 'pick' | 'plate' | 'sure' | 'wait' | 'two' | 'save';
/** The longest line of a person's own the drawing takes (plainNote in lib/emba/group-picture.ts). */
const NOTE = 60;

/** The group's tile: its drawn picture, or the rings. For a person who runs the group it opens the card. */
export function GroupTile({ scope, picture, pane, name }: TileProps & { name: string }) {
  // The picture the tile wears: the page's, until one is kept in the card.
  const [open, setOpen] = useState(false), [kept, setKept] = useState<string | null>(null), worn = kept ?? picture;
  /* eslint-disable-next-line @next/next/no-img-element -- a drawing served from the database at its own address */
  const face = worn ? <img src={groupPictureSrc(worn)} alt="" /> : <Rings />;
  // Someone who does not run the group has nothing to draw. A drawn picture is theirs to save, as it is any member's.
  if (!pane) return !worn ? <span className="gt-tile">{face}</span> : <span className="gp">
    <button className="gt-tile gp-has" aria-expanded={open} aria-label={`Group picture of ${name}. Save it`} onClick={() => setOpen(!open)}>{face}</button>
    {open && <SaveCard scope={scope} onClose={() => setOpen(false)} />}
  </span>;
  return <span className="gp">
    <button className={`gt-tile ${worn ? 'gp-has' : ''}`} aria-expanded={open} aria-label={`Group picture of ${name}. ${worn ? 'Change it' : 'Draw one'}`} onClick={() => setOpen(!open)}>
      {face}<i className="gp-pen" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 2.5l3 3L5 14H2v-3z" /></svg></i>
    </button>
    {open && <PictureCard scope={scope} pane={pane} onKept={setKept} onClose={() => setOpen(false)} />}
  </span>;
}

/** What makes a card of the tile: it sits above the page, under the tile, and closes on Escape or a press anywhere else. */
function useCard(onClose: () => void) {
  const box = useRef<HTMLDivElement>(null);
  // The ticket the tile is in cuts off anything that hangs out of it.
  useLayoutEffect(() => {
    const el = box.current!;
    // Under the tile, inside the window: as wide as its step wants and no taller than the room below the tile, so
    // nothing in it is out of reach (the page cannot scroll a card lifted above it). Placed again as its step changes its size.
    const place = () => {
      const by = el.parentElement!.getBoundingClientRect(), top = by.bottom + 14;
      el.style.left = `${Math.max(12, Math.min(by.left, innerWidth - el.offsetWidth - 12)) + window.scrollX}px`; el.style.top = `${top + window.scrollY}px`;
      el.style.maxHeight = `${Math.max(320, innerHeight - top - 16)}px`;
    };
    place();
    // Where the browser can lift it above the page it is lifted; elsewhere it is a card placed over the page.
    if (typeof el.showPopover === 'function') { el.setAttribute('popover', 'manual'); el.showPopover(); }
    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    sized?.observe(el); addEventListener('resize', place);
    return () => { sized?.disconnect(); removeEventListener('resize', place); };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const press = (event: PointerEvent) => { if (!box.current?.parentElement?.contains(event.target as Node)) onClose(); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', press);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', press); };
  }, [onClose]);
  return box;
}

/** The card of a member who does not run the group: the group's picture, to save. */
function SaveCard({ scope, onClose }: { scope: TileProps['scope']; onClose: () => void }) {
  return <div ref={useCard(onClose)} className="cs-lvl gp-card" role="dialog" aria-label="Group picture"><SaveFace of={scope} onBack={onClose} /></div>;
}

function PictureCard({ scope, pane, onKept, onClose }: { scope: TileProps['scope']; pane: PicturePane; onKept: (token: string) => void; onClose: () => void }) {
  const router = useRouter(), box = useCard(onClose);
  const [step, setStep] = useState<Step>('pics');
  const [picked, setPicked] = useState<Choice[]>([]), [only, setOnly] = useState<Choice['kind'] | null>(null), [find, setFind] = useState('');
  const [drawn, setDrawn] = useState(pane.waiting), [kept, setKept] = useState(pane.kept), [all, setAll] = useState(pane.drawn);
  const [plus, setPlus] = useState(pane.plus), [thanked, setThanked] = useState(false);
  const [note, setNote] = useState(''), [said, setSaid] = useState(''), [busy, setBusy] = useState(false);
  // Where "Back" on the asking step returns to, and how many more times this person may ask (null: no limit).
  const [from, setFrom] = useState<'pick' | 'two'>('pick'), [left, setLeft] = useState(pane.asksLeft);
  const ask = (back: 'pick' | 'two') => { setSaid(''); setFrom(back); setStep('sure'); };

  const toggle = (one: Choice) => {
    const at = picked.findIndex(each => keyOf(each.pick) === keyOf(one.pick));
    if (at < 0 && picked.length >= pane.most) return setSaid(`${pane.most} is the most for now.`);
    setSaid(''); setPicked(at < 0 ? [...picked, one] : picked.filter((_, index) => index !== at));
  };
  const draw = async () => {
    setSaid(''); setStep('wait');
    const got = await drawGroupPictureAction(scope, picked.map(one => one.pick), note).catch(() => FAILED);
    if (!got.ok) { setSaid(got.message); setStep('sure'); return; }
    setDrawn(got.tokens ?? []); setAll([...(got.tokens ?? []), ...all]); setLeft(left === null ? null : Math.max(0, left - 1)); setStep('two');
  };
  const keep = async (token: string) => {
    setBusy(true); setSaid('');
    const got = await keepGroupPictureAction(scope, token).catch(() => FAILED);
    setBusy(false);
    if (!got.ok) return setSaid(got.message);
    setKept(token); onKept(token); router.refresh();
  };

  /* eslint-disable @next/next/no-img-element -- icons from public/animals, made animals and drawings at their own addresses */
  const thanks = thanked && <p className="cs-own-thanks">{joinedWords('plus')} Enjoy your group picture.</p>;
  const alert = said && <p role="alert" className="gp-said">{said}</p>;
  const faces = <span className="gp-faces" aria-hidden="true">{picked.map(one => <img key={one.src} src={one.src} alt="" />)}</span>;
  const kinds = FILTERS.filter(([kind]) => pane.choices.some(one => one.kind === kind));

  // The card opens on the group's pictures: press one to wear it. The gold tile is the Ink+ part, and opens the animals.
  const fresh = <button className="gp-pic gp-new" onClick={() => { setSaid(''); setStep('pick'); }}><i aria-hidden="true">+</i><span>{all.length ? 'Draw a new one' : 'Draw one'}</span><InkMark plus named /></button>;
  // Saving the picture the group wears is any member's, and free (openspec loop-save-picture).
  const body = step === 'save' ? <SaveFace of={scope} onBack={() => { setSaid(''); setStep('pics'); }} />
  : step === 'pics' ? <div className="cs-lvl-body cs-pets">
    <div className="cs-pets-top"><p className="gp-tab">Group pictures{all.length > 0 && <b>{all.length}</b>}</p>{kept && <button className="cs-btn sm gp-save" onClick={() => { setSaid(''); setStep('save'); }}>Save the picture</button>}<button className="cs-btn sm go gp-done" onClick={onClose}>Done</button></div>
    {all.length ? <div className="gp-pics" role="group" aria-label="Group pictures">{fresh}
      {all.map((token, at) => <button key={token} className="gp-pic" aria-pressed={kept === token} aria-label={`Drawing ${all.length - at}`} disabled={busy} onClick={() => { if (kept !== token) void keep(token); }}>
        <img src={groupPictureSrc(token, true)} alt="" />{kept === token && <span className="gp-worn">Wearing this</span>}</button>)}</div>
    : <div className="gp-none">{fresh}<p>No picture yet. Pick the animals, and they are drawn together as one picture for the whole group.</p></div>}
    {alert}
  </div>
  : step === 'pick' ? <div className="cs-lvl-body cs-pets">
    {/* As the account card's picker: search on its own line, the filters under it with how many each shows (public/demo/mockups-picture-card-height.html, C) */}
    <div className="cs-pets-top" role="group" aria-label="Show">
      <input type="search" value={find} onChange={event => setFind(event.target.value)} aria-label="Search animals" placeholder="Search animals" />
      {kinds.map(([kind, label]) => <button key={kind} className={`cs-btn sm ${kind === 'ink' ? 'gold' : kind === 'school' ? 'school' : ''}`} aria-label={kind === 'own' ? undefined : label} title={kind === 'own' ? undefined : label} aria-pressed={only === kind} onClick={() => setOnly(only === kind ? null : kind)}>{kind === 'ink' ? <InkMark /> : kind === 'school' && <SchoolMark />}{kind === 'own' && `${label} `}<small aria-hidden="true">{pane.choices.filter(one => one.kind === kind).length}</small></button>)}
      <button className="cs-btn sm gp-done" onClick={() => { setSaid(''); setStep('pics'); }}>Back to pictures</button>
    </div>
    <PicturesWait className="cs-pets-grid" label="Animals for the picture">
      {pane.choices.filter(one => (!only || one.kind === only) && `${one.name} ${one.words}`.toLowerCase().includes(find.trim().toLowerCase())).map(one => {
        const at = picked.findIndex(each => keyOf(each.pick) === keyOf(one.pick));
        return <button key={one.src} className={`cs-pet ${one.kind === 'ink' ? 'gold' : one.kind === 'school' ? 'school' : ''}`} aria-pressed={at >= 0} aria-label={one.name} onClick={() => toggle(one)}>
          <img src={one.src} alt="" />{one.kind === 'ink' ? <InkMark /> : one.kind === 'school' && <SchoolMark />}{at >= 0 && <b className="gp-n">{at + 1}</b>}</button>;
      })}
    </PicturesWait>
    {alert}
    <div className="cs-prem-stub gp-foot">{faces}<b>{picked.length} of {pane.most}</b>
      <button className="cs-btn gold gp-go" aria-pressed="true" disabled={picked.length < pane.fewest} onClick={() => plus ? ask('pick') : (setSaid(''), setStep('plate'))}>Draw us together<InkMark plus named /></button></div>
  </div>
  : <div className="cs-lvl-body cs-pets cs-own"><div className="cs-prem">
    {step === 'plate' ? <>
      <button className="cs-prem-back" onClick={() => { setSaid(''); setStep('pick'); }}>Back</button>
      <p className="cs-prem-kick">Loopd Ink+</p>
      <p className="cs-prem-big">$9.99 <small>a month</small></p>
      <div className="cs-prem-figs" aria-hidden="true">{picked.slice(0, 2).map(one => <img key={one.src} src={one.src} alt="" />)}</div>
      <div className="cs-prem-perks"><span>Your group, drawn together from the animals you pick</span><span>Say what should change, and it is drawn again</span>
        <small>Groups of more than {pane.most}, and saving a picture without the Loopd mark, are not here yet.</small></div>
      {/* The one Get button (public/demo/mockups-ink-buttons.html): one press, the account's email, then on to drawing. */}
      <div className="cs-prem-stub"><GetInk plan="plus" place="group picture: Get Ink+" onJoined={() => { setPlus(true); setThanked(true); ask('pick'); }} />{alert}</div></>
    : step === 'sure' ? <>
      <button className="cs-prem-back" onClick={() => { setSaid(''); setStep(from); }}>Back</button>
      <p className="cs-prem-kick">Loopd Ink+</p>
      <p className="cs-prem-big said">Draw these {picked.length} together?</p>
      {thanks}
      <div className="cs-prem-made gp-wait" aria-hidden="true">{picked.map(one => <img key={one.src} src={one.src} alt="" />)}</div>
      <form className="cs-prem-stub" onSubmit={event => { event.preventDefault(); void draw(); }}>
        <div className="cs-prem-join"><input value={note} onChange={event => setNote(event.target.value)} maxLength={NOTE} aria-label="Anything to add" placeholder="Anything to add? Matching scarves…" autoComplete="off" /><button className="cs-btn go">Yes, draw us</button></div>
        <p className="cs-prem-small">{note.length} of {NOTE} letters, and you can leave it empty. Nothing is drawn until you press Yes.{left !== null && ` You can do this ${left} more ${left === 1 ? 'time' : 'times'}.`}</p>
        {alert}
      </form></>
    : step === 'wait' ? <>
      <p className="cs-prem-kick">Loopd Ink+</p>
      <p className="cs-prem-big said" role="status">Drawing you together.</p>
      {thanks}
      <div className="cs-prem-made gp-wait"><SeatsTicket quiet /></div>
      <div className="cs-prem-stub"><p className="cs-prem-small">About a minute. Two drawings, and you keep one.</p></div></>
    : <>
      <button className="cs-prem-back" onClick={() => { setSaid(''); setStep('pics'); }}>Pictures</button>
      <p className="cs-prem-kick">Loopd Ink+</p>
      <p className="cs-prem-big said">{kept && drawn.includes(kept) ? 'Say hi to your group.' : 'Pick your favorite.'}</p>
      {thanks}
      <div className="gp-two">{drawn.map((token, at) => <figure key={token}><img src={groupPictureSrc(token, true)} alt={`Drawing ${at + 1}`} />
        <button className={`cs-btn sm ${kept === token ? 'go' : ''}`} aria-pressed={kept === token} disabled={busy || kept === token} onClick={() => void keep(token)}>{kept === token ? 'Kept' : 'Keep this one'}</button></figure>)}</div>
      <div className="cs-prem-stub">
        {picked.length >= pane.fewest && <button className="cs-btn go" onClick={() => ask('two')}>Draw again</button>}
        <button className="cs-btn" onClick={() => { setSaid(''); setStep('pick'); }}>Pick other animals</button>
        {alert}
      </div></>}
  </div></div>;
  return <div ref={box} className="cs-lvl gp-card" role="dialog" aria-label="Group picture">{body}</div>;
}
