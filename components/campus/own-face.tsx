'use client';

import { useRef, useState } from 'react';
import { againFaceAction, keepFaceAction, makeFaceAction, subscribeAction } from '@/app/c/actions';
import { animal, CHANGES } from '@/lib/campus/animals';
import { SeatsTicket, SeatsWord } from '@/components/loading/seats';
import { INK_MAKES, joinedWords } from '@/lib/campus/ink';
import { JoinPlan } from './join-plan';
import { InkMark } from './ink-mark';

/** Shrinks a photo in the browser, on white, so it uploads quickly. A file the browser cannot draw is sent as it is. */
async function small(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file), scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'), pen = canvas.getContext('2d')!;
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    pen.fillStyle = '#fff'; pen.fillRect(0, 0, canvas.width, canvas.height); pen.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((done, fail) => canvas.toBlob(blob => (blob ? done(blob) : fail(new Error('no picture'))), 'image/jpeg', 0.9));
  } catch { return file; }
}

/** What the Ink page leads with. None of the four can be used yet, and the pane says so under them, with what Ink gives today. */
const PERKS = ['Your book, kept for good', 'Give an animal a month', 'Boost a group a month', 'Join at any school'];

/**
 * "Create your own" in the account card. It is part of Loopd Ink, so it opens on the plan: what Ink is, its
 * price, and Subscribe, which asks for an email in its own place. There is no payment yet: the ask is kept
 * (lib/campus/custom-face.ts), the person is told so, and then gives a photo of an animal, which is drawn as one of
 * the set, free.
 */
export function OwnFace({ asked, left, current, bases = [], plus = false, wearing = null, onAsked, onMade, onKept, onBack }: { asked: boolean; /** How many more Ink lets them make; null for no limit (Ink+, and the admin). */ left: number | null; current: string; /** What "Start from another pet" offers: their own made animals and the Ink ones; the admin's, every one. */ bases?: { src: string; name: string }[]; /** Ink+, or the admin: they may start from another pet and redraw one. Without it both are still shown, marked Ink+, and offer Ink+ where the drawing would be. */ plus?: boolean; /** The picture they wear, picked first when it is among `bases`. */ wearing?: string | null; onAsked: () => void; onMade: (own: string, left: number | null) => void; onKept: (kept: string, dropped: string) => void; onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null), [shown, setShown] = useState(''), [email, setEmail] = useState('');
  // `asking` is the email field in the button's place. `first` is whether they subscribed on this visit: the thanks are shown for it until the pane is left.
  const [state, setState] = useState<'plan' | 'photo' | 'sure' | 'busy' | 'done' | 'ask' | 'pick' | 'base'>(asked ? 'photo' : 'plan'), [asking, setAsking] = useState(false), [first, setFirst] = useState(false);
  const [wait, setWait] = useState(false), [said, setSaid] = useState(''), [own, setOwn] = useState('');
  // The animal a new drawing is set beside: the one made on this visit, or the one they had (`current`).
  const mine = own || current;
  // Drawing a made animal again: a photo and what should change, then the two side by side. `second` is the retry, `pick` which of the two is chosen.
  const [changes, setChanges] = useState<string[]>([]), [note, setNote] = useState(''), [second, setSecond] = useState(''), [pick, setPick] = useState(1), [tried, setTried] = useState(false);
  // Nothing is drawn on one press: "Draw it" and "Draw again" lead to a step that asks first, where a line of the person's own can be added. `from` is the step it was reached from.
  const [from, setFrom] = useState<'photo' | 'ask' | 'base'>('photo');
  // Starting from another pet: which one, then the same line of words, and no photo.
  const [base, setBase] = useState(bases.find(one => one.src === wearing)?.src ?? bases[0]?.src ?? '');
  const fromBase = async () => {
    setSaid(''); setState('busy');
    const data = new FormData();
    data.set('base', base); data.set('note', note.trim());
    const got = await makeFaceAction(data).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
    if (got.ok) { setOwn(got.own); setState('done'); onMade(got.own, got.left); } else { setSaid(got.message); setState('base'); }
  };
  const sure = (step: 'photo' | 'ask') => {
    // A redraw needs no new photo: without one the animal they have is drawn again, and then something to change must be said.
    if (!file && (step === 'photo' || !mine)) return setSaid('Choose a photo of an animal first.');
    if (!file && !changes.length && !note.trim()) return setSaid('Say what should change.');
    setSaid(''); setFrom(step); setState('sure');
  };
  const again = async () => {
    if (!file && !mine) return setSaid('Choose a photo of an animal first.');
    setSaid(''); setState('busy');
    const data = new FormData();
    if (file) data.set('photo', await small(file), 'photo.jpg');
    data.set('first', mine);
    for (const one of changes) data.append('change', one);
    if (note.trim()) data.set('note', note.trim());
    // With no animal of their own left to set it beside, it is simply made.
    if (!mine) {
      const got = await makeFaceAction(data).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
      if (got.ok) { setOwn(got.own); setState('done'); onMade(got.own, got.left); } else { setSaid(got.message); setState('ask'); }
      return;
    }
    const got = await againFaceAction(data).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
    if (got.ok) { setSecond(got.own); setTried(true); setPick(1); setState('pick'); } else { setSaid(got.message); setState('ask'); }
  };
  const keep = async () => {
    const kept = pick ? second : mine, dropped = pick ? mine : second;
    setSaid(''); setWait(true);
    const got = await keepFaceAction(kept).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
    setWait(false);
    if (got.ok) { setOwn(kept); setState('done'); onKept(kept, dropped); } else setSaid(got.message);
  };
  const input = useRef<HTMLInputElement>(null);
  const choose = (next?: File) => { if (!next) return; if (shown) URL.revokeObjectURL(shown); setFile(next); setShown(URL.createObjectURL(next)); setSaid(''); };
  const subscribe = async () => {
    if (!asking) return setAsking(true);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setSaid('Enter the email to subscribe with.');
    setSaid(''); setWait(true);
    const got = await subscribeAction(email.trim()).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
    setWait(false);
    if (got.ok) { setFirst(true); setState('photo'); onAsked(); } else setSaid(got.message);
  };
  const make = async () => {
    if (!file) return setSaid('Choose a photo of an animal first.');
    setSaid(''); setState('busy');
    const data = new FormData();
    data.set('photo', await small(file), 'photo.jpg');
    if (note.trim()) data.set('note', note.trim());
    const got = await makeFaceAction(data).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
    if (got.ok) { setOwn(got.own); setState('done'); onMade(got.own, got.left); } else { setSaid(got.message); setState('photo'); }
  };
  const thanks = first && !tried && state !== 'ask' && <p className="cs-own-thanks">{joinedWords('ink')} Enjoy your avatar.</p>;
  /* eslint-disable @next/next/no-img-element -- icons from public/animals, the person's own photo from their device, and the picture made from it */
  if (state === 'plan') return <div className="cs-lvl-body cs-pets cs-own"><div className="cs-prem">
    <button className="cs-prem-back" onClick={onBack}>Back</button>
    <p className="cs-prem-kick">Loopd Ink</p>
    <p className="cs-prem-big">$2.99 <small>a month</small></p>
    <div className="cs-prem-figs" aria-hidden="true"><img src={animal(22)} alt="" /><img src={animal(36)} alt="" /></div>
    <div className="cs-prem-perks">{PERKS.map(perk => <span key={perk}>{perk}</span>)}<small>These four are not here yet. Today Ink is the Ink animals and three pets, drawn from your photos.</small></div>
    <form className="cs-prem-stub" onSubmit={event => { event.preventDefault(); void subscribe(); }}>
      {asking ? <div className="cs-prem-join"><input type="email" value={email} onChange={event => setEmail(event.target.value)} aria-label="Email" placeholder="Email to subscribe with" autoComplete="email" autoFocus /><button className="cs-btn go" disabled={wait}><SeatsWord on={wait} word="Subscribing" plate>Subscribe</SeatsWord></button></div>
        : <button className="cs-btn go">Subscribe to Loopd Ink</button>}
      {said && <p role="alert">{said}</p>}
    </form>
  </div></div>;
  // All three of Ink's animals are made: the same plate says so and offers Ink+, which has no limit, and still offers to draw one again.
  if (state === 'photo' && left !== null && left <= 0) return <div className="cs-lvl-body cs-pets cs-own"><div className="cs-prem">
    <button className="cs-prem-back" onClick={onBack}>Back</button>
    <p className="cs-prem-kick">Loopd Ink</p>
    <p className="cs-prem-big said">You have made all three.</p>
    <div className="cs-prem-perks"><span>Ink+ makes as many as you like and redraws any of them, with your AI and any school’s colours. $9.99 a month.</span></div>
    <div className="cs-prem-stub"><JoinPlan plan="plus" place="pets: Get Ink+" className="cs-btn go"><InkMark plus />Get Ink+ · $9.99</JoinPlan></div>
  </div></div>;
  // The photo, the wait, the made animal and its one retry are the same plate as the plan: one headline each, and the stub holds what to press.
  const head = { photo: 'Bring your own pet.', base: 'Start from another pet.', sure: from === 'ask' ? 'Draw your pet again?' : from === 'base' ? 'Draw it again?' : 'Draw your pet?', busy: 'Drawing your pet.', done: 'Say hi to your new picture.', ask: plus ? 'What should change?' : 'Redraws come with Ink+.', pick: 'Pick your favorite.', plan: '' }[state];
  return <div className="cs-lvl-body cs-pets cs-own"><div className="cs-prem">
    {state === 'sure' ? <button className="cs-prem-back" onClick={() => { setSaid(''); setState(from); }}>Back</button>
    : state === 'ask' ? <button className="cs-prem-back" onClick={() => { setSaid(''); setState(own ? 'done' : 'photo'); }}>Back</button>
    : state === 'base' ? <button className="cs-prem-back" onClick={() => { setSaid(''); setState('photo'); }}>Back</button>
    : state !== 'busy' && state !== 'pick' && <button className="cs-prem-back" onClick={onBack}>{state === 'done' ? 'Done' : 'Back'}</button>}
    <p className="cs-prem-kick">Loopd Ink</p>
    <p className="cs-prem-big said" role={state === 'busy' ? 'status' : undefined}>{head}</p>
    {thanks}
    {state === 'done' ? <><div className="cs-prem-made"><img src={own} alt="Your own animal" /></div>
      <div className="cs-prem-stub"><button className="cs-btn" onClick={() => { setSaid(''); setNote(''); setChanges([]); setState('ask'); }}>{!plus && <InkMark plus />}Redraw your pet{!plus && ' · Ink+'}</button><p className="cs-prem-small">A new drawing, set beside this one. You keep one.</p></div></>
    : state === 'sure' ? <><div className="cs-prem-made">{from === 'base' ? <img src={base} alt="The pet you start from" /> : shown ? <img src={shown} alt="The photo you chose" /> : from === 'ask' && mine && <img src={mine} alt="The pet drawn again" />}{from === 'base' && <p>{note.trim()}</p>}</div>
      <form className="cs-prem-stub" onSubmit={event => { event.preventDefault(); void (from === 'ask' ? again() : from === 'base' ? fromBase() : make()); }}>
        {/* A redraw was already told what to change, chips and words together, on the step before: it is only asked here. */}
        {from === 'photo' && <div className="cs-prem-join"><input value={note} onChange={event => setNote(event.target.value)} maxLength={60} aria-label="Anything to add" placeholder="Anything to add: floppier ears…" autoComplete="off" autoFocus /></div>}
        <button className="cs-btn go">Yes, draw it</button>
        <p className="cs-prem-small">{from === 'photo' && `${note.length} of 60 letters, and you can leave it empty. `}Nothing is drawn until you press Yes.</p>
      </form></>
    : state === 'busy' ? <div className="cs-prem-made"><SeatsTicket quiet /><p>This takes about half a minute.</p></div>
    : state === 'ask' && !plus ? <><div className="cs-prem-made">{mine && <img src={mine} alt="Your pet" />}</div>
      <div className="cs-prem-perks"><span>Say what should change and we draw your pet again, as often as you like. Ink+ also makes as many pets as you like. $9.99 a month.</span></div>
      <div className="cs-prem-stub"><JoinPlan plan="plus" place="pets: Redraw your pet" className="cs-btn go"><InkMark plus />Get Ink+ · $9.99</JoinPlan></div></>
    : state === 'ask' ? <><div className="cs-prem-perks"><span>{mine ? 'Say what should change, and we’ll draw it again. A new photo is up to you.' : 'Give a photo and say what should change. We’ll draw it again.'}</span></div>
      <form className="cs-prem-stub" onSubmit={event => { event.preventDefault(); sure('ask'); }}>
        <input ref={input} type="file" accept="image/*" hidden aria-label="Photo of an animal" onChange={event => choose(event.target.files?.[0])} />
        <button type="button" className={`cs-own-photo ${shown || mine ? 'has' : ''}`} onClick={() => input.current?.click()}>{shown ? <><img src={shown} alt="" /><span><b>Photo added</b><small>Tap to change it</small></span></> : mine ? <><img src={mine} alt="" /><span><b>Drawn again from this one</b><small>Tap to use a new photo instead</small></span></> : <><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg></i><span><b>Upload a photo of your pet</b><small>Tap here to choose one</small></span></>}</button>
        <div className="cs-chips" role="group" aria-label="What should change">{CHANGES.filter(one => file || !mine || one !== 'Truer colors').map(one => <button key={one} type="button" aria-pressed={changes.includes(one)} onClick={() => setChanges(had => had.includes(one) ? had.filter(each => each !== one) : [...had, one])}>{one}</button>)}</div>
        <div className="cs-prem-join"><input value={note} onChange={event => setNote(event.target.value)} maxLength={60} aria-label="Or say it yourself" placeholder="Or say it yourself: floppier ears…" autoComplete="off" /></div>
        <button className="cs-btn go">Draw again</button>
        {said && <p role="alert">{said}</p>}
      </form></>
    : state === 'base' ? <><div className="cs-prem-perks"><span>{plus ? 'Pick one, and say what should change. We’ll draw it again with that.' : 'Pick one of these, say what should change, and we draw it again with that. It comes with Ink+, $9.99 a month.'}</span></div>
      <form className="cs-prem-stub" onSubmit={event => { event.preventDefault(); if (!base) return setSaid('Pick a pet first.'); if (!note.trim()) return setSaid('Say what should change.'); setSaid(''); setFrom('base'); setState('sure'); }}>
        {/* Only the animals scroll; the box and Draw it stay pinned at the card's foot (public/demo/mockups-pet-base-pick.html, B). */}
        <div className="cs-own-scroll"><div className="cs-pets-grid cs-own-bases" role="group" aria-label="Start from">{bases.map(one => <button key={one.src} type="button" className="cs-pet" aria-pressed={base === one.src} aria-label={one.name} onClick={() => setBase(one.src)}><img src={one.src} alt="" /></button>)}</div></div>
        <div className="cs-own-foot">
        {said && <p role="alert">{said}</p>}
        {plus ? <><div className="cs-prem-join">{base ? <img src={base} alt="" /> : <i aria-hidden="true">?</i>}<input value={note} onChange={event => setNote(event.target.value)} maxLength={60} aria-label="What should change" placeholder={base ? 'What should change: add a red scarf…' : 'Pick a pet above first'} autoComplete="off" /></div>
        <button className="cs-btn go">Draw it</button>
        <p className="cs-prem-small">{note.length} of 60 letters.</p></>
        : <JoinPlan plan="plus" place="pets: Start from another pet" className="cs-btn go"><InkMark plus />Get Ink+ · $9.99</JoinPlan>}
        </div>
      </form></>
    : state === 'pick' ? <><div className="cs-two" role="group" aria-label="Pick your favorite">{[own, second].map((one, at) => <button key={one} aria-pressed={pick === at} aria-label={at ? 'Second drawing' : 'First drawing'} onClick={() => setPick(at)}><img src={one} alt="" /><span>{at ? 'Second' : 'First'}</span></button>)}</div>
      <div className="cs-prem-stub"><button className="cs-btn go" disabled={wait} onClick={() => void keep()}><SeatsWord on={wait} word="Keeping" plate>Keep this one</SeatsWord></button><p className="cs-prem-small">The other one is let go.</p>{said && <p role="alert">{said}</p>}</div></>
    : <><div className="cs-prem-perks"><span>Grab your favorite photo of your favorite pet, and we’ll do the rest.</span>{left !== null && <small>{left} of {INK_MAKES} left.</small>}</div>
      <form className="cs-prem-stub" onSubmit={event => { event.preventDefault(); sure('photo'); }}>
        <input ref={input} type="file" accept="image/*" hidden aria-label="Photo of an animal" onChange={event => choose(event.target.files?.[0])} />
        <button type="button" className={`cs-own-photo ${shown ? 'has' : ''}`} onClick={() => input.current?.click()}>{shown ? <><img src={shown} alt="" /><span><b>Photo added</b><small>Tap to change it</small></span></> : <><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg></i><span><b>Upload a photo of your pet</b><small>Tap here to choose one</small></span></>}</button>
        <button className="cs-btn go">Draw it</button>
        {/* Always offered. Without Ink+ it wears the mark, and the step it opens offers Ink+. */}
        <button type="button" className="cs-btn" onClick={() => { setSaid(''); setState('base'); }}>{!plus && <InkMark plus />}Start from another pet{!plus && ' · Ink+'}</button>
        {said && <p role="alert">{said}</p>}
      </form></>}
  </div></div>;
  /* eslint-enable @next/next/no-img-element */
}
