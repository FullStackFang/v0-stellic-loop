'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { InkMark, SchoolMark } from '@/components/campus/ink-mark';
import type { Choice, Pick, PicturePane, TileProps } from '@/lib/emba/group-picture';
import { groupPictureSrc } from '@/lib/emba/group-picture-src';
import { drawGroupPictureAction, keepGroupPictureAction, subscribeInkPlusAction } from './picture-actions';
import './group-picture.css';

// A group's tile, and the card that draws its picture (openspec loop-group-picture; the look and the steps are
// public/demo/mockups-group-picture-place.html, A). The card wears the classes of the account card's animal picker
// and its Ink plate (app/c/campus.css), so it follows them. Every rule is checked again on the server.

const keyOf = (pick: Pick) => 'face' in pick ? `f${pick.face}` : `t${pick.token}`;
const FAILED = { ok: false as const, message: 'That did not go through. Try again.' };
const FILTERS: [Choice['kind'], string][] = [['own', 'Yours'], ['school', 'Schools'], ['ink', 'Ink']];
type Step = 'pick' | 'plate' | 'sure' | 'wait' | 'two' | 'all';
/** The longest line of a person's own the drawing takes (plainNote in lib/emba/group-picture.ts). */
const NOTE = 60;

/** The group's tile: its drawn picture, or the rings. For a person who runs the group it opens the card. */
export function GroupTile({ scope, picture, pane, name }: TileProps & { name: string }) {
  // The picture the tile wears: the page's, until one is kept in the card.
  const [open, setOpen] = useState(false), [kept, setKept] = useState<string | null>(null), worn = kept ?? picture;
  /* eslint-disable-next-line @next/next/no-img-element -- a drawing served from the database at its own address */
  const face = worn ? <img src={groupPictureSrc(worn)} alt="" /> : <Rings />;
  if (!pane) return <span className={`gt-tile ${worn ? 'gp-has' : ''}`}>{face}</span>;
  return <span className="gp">
    <button className={`gt-tile ${worn ? 'gp-has' : ''}`} aria-expanded={open} aria-label={`Group picture of ${name}. ${worn ? 'Change it' : 'Draw one'}`} onClick={() => setOpen(!open)}>
      {face}<i className="gp-pen" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 2.5l3 3L5 14H2v-3z" /></svg></i>
    </button>
    {open && <PictureCard scope={scope} pane={pane} onKept={setKept} onClose={() => setOpen(false)} />}
  </span>;
}

function PictureCard({ scope, pane, onKept, onClose }: { scope: TileProps['scope']; pane: PicturePane; onKept: (token: string) => void; onClose: () => void }) {
  const router = useRouter(), box = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>(pane.waiting.length ? 'two' : 'pick');
  const [picked, setPicked] = useState<Choice[]>([]), [only, setOnly] = useState<Choice['kind'] | null>(null);
  const [drawn, setDrawn] = useState(pane.waiting), [kept, setKept] = useState(pane.kept), [all, setAll] = useState(pane.drawn);
  const [plus, setPlus] = useState(pane.plus), [thanked, setThanked] = useState(false);
  const [email, setEmail] = useState(''), [note, setNote] = useState(''), [said, setSaid] = useState(''), [busy, setBusy] = useState(false);
  // Where "Back" on the asking step returns to, and how many more times this person may ask (null: no limit).
  const [from, setFrom] = useState<'pick' | 'two'>('pick'), [left, setLeft] = useState(pane.asksLeft);
  const ask = (back: 'pick' | 'two') => { setSaid(''); setFrom(back); setStep('sure'); };

  // The card sits above the page, under the tile: the ticket the tile is in cuts off anything that hangs out of it.
  useLayoutEffect(() => {
    const el = box.current!, by = el.parentElement!.getBoundingClientRect();
    el.style.left = `${Math.max(12, by.left + window.scrollX)}px`; el.style.top = `${by.bottom + window.scrollY + 14}px`;
    // Where the browser can lift it above the page it is lifted; elsewhere it is a card placed over the page.
    if (typeof el.showPopover === 'function') { el.setAttribute('popover', 'manual'); el.showPopover(); }
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const press = (event: PointerEvent) => { if (!box.current?.parentElement?.contains(event.target as Node)) onClose(); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', press);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', press); };
  }, [onClose]);

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
  const subscribe = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setSaid('Enter the email to subscribe with.');
    setBusy(true); setSaid('');
    const got = await subscribeInkPlusAction(email.trim()).catch(() => FAILED);
    setBusy(false);
    if (!got.ok) return setSaid(got.message);
    setPlus(true); setThanked(true); ask('pick');
  };
  const keep = async (token: string) => {
    setBusy(true); setSaid('');
    const got = await keepGroupPictureAction(scope, token).catch(() => FAILED);
    setBusy(false);
    if (!got.ok) return setSaid(got.message);
    setKept(token); onKept(token); router.refresh();
  };

  /* eslint-disable @next/next/no-img-element -- icons from public/animals, made animals and drawings at their own addresses */
  const thanks = thanked && <p className="cs-own-thanks">Thanks for subscribing to Loop Ink+. Payment is not set up yet, so this one is free. Enjoy your group picture.</p>;
  const alert = said && <p role="alert" className="gp-said">{said}</p>;
  const faces = <span className="gp-faces" aria-hidden="true">{picked.map(one => <img key={one.src} src={one.src} alt="" />)}</span>;
  const kinds = FILTERS.filter(([kind]) => pane.choices.some(one => one.kind === kind));

  const body = step === 'pick' ? <div className="cs-lvl-body cs-pets">
    <div className="cs-pets-top" role="group" aria-label="Show">
      {kinds.map(([kind, label]) => <button key={kind} className={`cs-btn sm ${kind === 'ink' ? 'gold' : ''}`} aria-pressed={only === kind} onClick={() => setOnly(only === kind ? null : kind)}>{kind === 'ink' ? <InkMark /> : kind === 'school' && <SchoolMark />}{label}</button>)}
      {all.length > 0 && <button className="cs-btn sm" onClick={() => { setSaid(''); setStep('all'); }}>Drawn {all.length}</button>}
      <button className="cs-btn sm go gp-done" onClick={onClose}>Done</button>
    </div>
    <div className="cs-pets-grid" role="group" aria-label="Animals for the picture">
      {pane.choices.filter(one => !only || one.kind === only).map(one => {
        const at = picked.findIndex(each => keyOf(each.pick) === keyOf(one.pick));
        return <button key={one.src} className={`cs-pet ${one.kind === 'ink' ? 'gold' : one.kind === 'school' ? 'school' : ''}`} aria-pressed={at >= 0} aria-label={one.name} onClick={() => toggle(one)}>
          <img src={one.src} alt="" />{one.kind === 'ink' ? <InkMark /> : one.kind === 'school' && <SchoolMark />}{at >= 0 && <b className="gp-n">{at + 1}</b>}</button>;
      })}
    </div>
    {alert}
    <div className="cs-prem-stub gp-foot">{faces}<b>{picked.length} of {pane.most}</b>
      <button className="cs-btn gold gp-go" aria-pressed="true" disabled={picked.length < pane.fewest} onClick={() => plus ? ask('pick') : (setSaid(''), setStep('plate'))}>Draw us together<i className="gp-plus">Ink+</i></button></div>
  </div>
  : <div className="cs-lvl-body cs-pets cs-own"><div className="cs-prem">
    {step === 'plate' ? <>
      <button className="cs-prem-back" onClick={() => { setSaid(''); setStep('pick'); }}>Back</button>
      <p className="cs-prem-kick">Loop Ink+</p>
      <p className="cs-prem-big">$9.99 <small>a month</small></p>
      <div className="cs-prem-figs" aria-hidden="true">{picked.slice(0, 2).map(one => <img key={one.src} src={one.src} alt="" />)}</div>
      <div className="cs-prem-perks"><span>Your group, drawn together from the animals you pick</span><span>Say what should change, and it is drawn again</span>
        <small>Groups of more than {pane.most}, and saving a picture without the Loop mark, are not here yet.</small></div>
      <form className="cs-prem-stub" onSubmit={event => { event.preventDefault(); void subscribe(); }}>
        <div className="cs-prem-join"><input type="email" value={email} onChange={event => setEmail(event.target.value)} aria-label="Email" placeholder="Email to subscribe with" autoComplete="email" autoFocus /><button className="cs-btn go" disabled={busy}>Subscribe</button></div>
        {alert}
      </form></>
    : step === 'sure' ? <>
      <button className="cs-prem-back" onClick={() => { setSaid(''); setStep(from); }}>Back</button>
      <p className="cs-prem-kick">Loop Ink+</p>
      <p className="cs-prem-big said">Draw these {picked.length} together?</p>
      {thanks}
      <div className="cs-prem-made gp-wait" aria-hidden="true">{picked.map(one => <img key={one.src} src={one.src} alt="" />)}</div>
      <form className="cs-prem-stub" onSubmit={event => { event.preventDefault(); void draw(); }}>
        <div className="cs-prem-join"><input value={note} onChange={event => setNote(event.target.value)} maxLength={NOTE} aria-label="Anything to add" placeholder="Anything to add? Matching scarves…" autoComplete="off" /><button className="cs-btn go">Yes, draw us</button></div>
        <p className="cs-prem-small">{note.length} of {NOTE} letters, and you can leave it empty. Nothing is drawn until you press Yes.{left !== null && ` You can do this ${left} more ${left === 1 ? 'time' : 'times'}.`}</p>
        {alert}
      </form></>
    : step === 'all' ? <>
      <button className="cs-prem-back" onClick={() => { setSaid(''); setStep('pick'); }}>Back</button>
      <p className="cs-prem-kick">Loop Ink+</p>
      <p className="cs-prem-big said">Every drawing of your group.</p>
      <div className="gp-two gp-all">{all.map((token, at) => <figure key={token}><img src={groupPictureSrc(token, true)} alt={`Drawing ${all.length - at}`} />
        <button className={`cs-btn sm ${kept === token ? 'go' : ''}`} aria-pressed={kept === token} disabled={busy || kept === token} onClick={() => void keep(token)}>{kept === token ? 'Worn now' : 'Use this one'}</button></figure>)}</div>
      {alert}</>
    : step === 'wait' ? <>
      <p className="cs-prem-kick">Loop Ink+</p>
      <p className="cs-prem-big said" role="status">Drawing you together.</p>
      {thanks}
      <div className="cs-prem-made gp-wait" aria-hidden="true">{picked.map(one => <img key={one.src} className="busy" src={one.src} alt="" />)}</div>
      <div className="cs-prem-stub"><p className="cs-prem-small">About a minute. Two drawings, and you keep one.</p></div></>
    : <>
      <button className="cs-prem-back" onClick={onClose}>Done</button>
      <p className="cs-prem-kick">Loop Ink+</p>
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
