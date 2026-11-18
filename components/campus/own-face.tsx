'use client';

import { useRef, useState } from 'react';
import { codeAction, makeFaceAction, subscribeAction } from '@/app/c/actions';
import { animal } from '@/lib/campus/animals';

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

/** What Loop Premium is said to come with. Only the first exists; the rest are what the ask is testing. */
const PERKS = ['Your own pet, drawn from your photo', 'Every premium animal', 'Your plans lifted to the top for a day', 'New rewards a week early'];

/**
 * "Create your own" in the account card. It is part of Loop Premium, so it opens on the plan: what Premium is, its
 * price, and Subscribe, which asks for an email in its own place. There is no payment yet: the ask is kept
 * (lib/campus/custom-face.ts), the person is told so, and then gives a photo of an animal, which is drawn as one of
 * the set, free.
 */
export function OwnFace({ asked, left, onAsked, onMade, onBack }: { asked: boolean; left: number; onAsked: () => void; onMade: (own: string, left: number) => void; onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null), [shown, setShown] = useState(''), [email, setEmail] = useState('');
  // `asking` is the email field in the button's place. `first` is whether they subscribed on this visit: the thanks are shown for it until the pane is left.
  const [state, setState] = useState<'plan' | 'photo' | 'busy' | 'done'>(asked ? 'photo' : 'plan'), [asking, setAsking] = useState(false), [first, setFirst] = useState(false);
  const [wait, setWait] = useState(false), [said, setSaid] = useState(''), [own, setOwn] = useState('');
  // With the free animal made, a code lets them make another: `typed` is the field, `code` the one the server took.
  const [typed, setTyped] = useState(''), [code, setCode] = useState('');
  const redeem = async () => {
    setSaid(''); setWait(true);
    const got = await codeAction(typed).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
    setWait(false);
    if (got.ok) setCode(typed); else setSaid(got.message);
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
    if (code) data.set('code', code);
    const got = await makeFaceAction(data).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
    if (got.ok) { setOwn(got.own); setState('done'); onMade(got.own, got.left); } else { setSaid(got.message); setState('photo'); }
  };
  const thanks = first && <p className="cs-own-thanks">Thanks for subscribing to Loop Premium. Payment is not set up yet, so this one is free. Enjoy your avatar.</p>;
  /* eslint-disable @next/next/no-img-element -- icons from public/animals, the person's own photo from their device, and the picture made from it */
  if (state === 'plan') return <div className="cs-lvl-body cs-pets cs-own"><div className="cs-prem">
    <button className="cs-prem-back" onClick={onBack}>Back</button>
    <p className="cs-prem-kick">Loop Premium</p>
    <p className="cs-prem-big">$3 <small>a month</small></p>
    <div className="cs-prem-figs" aria-hidden="true"><img src={animal(22)} alt="" /><img src={animal(36)} alt="" /></div>
    <div className="cs-prem-perks">{PERKS.map(perk => <span key={perk}>{perk}</span>)}<small>And more as it comes.</small></div>
    <form className="cs-prem-stub" onSubmit={event => { event.preventDefault(); void subscribe(); }}>
      {asking ? <div className="cs-prem-join"><input type="email" value={email} onChange={event => setEmail(event.target.value)} aria-label="Email" placeholder="Email to subscribe with" autoComplete="email" autoFocus /><button className="cs-btn go" disabled={wait}>Subscribe</button></div>
        : <button className="cs-btn go">Subscribe to Loop Premium</button>}
      {said && <p role="alert">{said}</p>}
    </form>
  </div></div>;
  // The free animal is made: the same plate says so, before a photo is asked for, and takes a code.
  if (state === 'photo' && left <= 0 && !code) return <div className="cs-lvl-body cs-pets cs-own"><div className="cs-prem">
    <button className="cs-prem-back" onClick={onBack}>Back</button>
    <p className="cs-prem-kick">Loop Premium</p>
    <p className="cs-prem-big said">You’re already subscribed and got your free avatar!</p>
    <div className="cs-prem-perks"><span>More pets and more perks will come with Premium once it officially launches. Stay tuned!</span></div>
    <form className="cs-prem-stub" onSubmit={event => { event.preventDefault(); void redeem(); }}>
      <div className="cs-prem-join"><input value={typed} onChange={event => setTyped(event.target.value)} aria-label="Code" placeholder="Have a code?" autoCapitalize="characters" autoComplete="off" spellCheck={false} /><button className="cs-btn go" disabled={wait || !typed.trim()}>Use code</button></div>
      {said && <p role="alert">{said}</p>}
    </form>
  </div></div>;
  // The photo, the wait and the made animal are the same plate as the plan: one headline each, and the stub holds what to press.
  const head = state === 'done' ? 'Say hi to your new picture.' : state === 'busy' ? 'Drawing your pet.' : 'Bring your own pet.';
  return <div className="cs-lvl-body cs-pets cs-own"><div className="cs-prem">
    {state !== 'busy' && <button className="cs-prem-back" onClick={onBack}>{state === 'done' ? 'Done' : 'Back'}</button>}
    <p className="cs-prem-kick">Loop Premium</p>
    <p className="cs-prem-big said" role={state === 'busy' ? 'status' : undefined}>{head}</p>
    {thanks}
    {state === 'done' ? <div className="cs-prem-made"><img src={own} alt="Your own animal" /></div>
    : state === 'busy' ? <div className="cs-prem-made">{shown && <img className="busy" src={shown} alt="" />}<p>This takes about half a minute.</p></div>
    : <><div className="cs-prem-perks"><span>Grab your favorite photo of your favorite pet, and we’ll do the rest.</span></div>
      <form className="cs-prem-stub" onSubmit={event => { event.preventDefault(); void make(); }}>
        <input ref={input} type="file" accept="image/*" hidden aria-label="Photo of an animal" onChange={event => choose(event.target.files?.[0])} />
        <button type="button" className={`cs-own-photo ${shown ? 'has' : ''}`} onClick={() => input.current?.click()}>{shown ? <><img src={shown} alt="" /><span><b>Photo added</b><small>Tap to change it</small></span></> : <><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg></i><span><b>Upload a photo of your pet</b><small>Tap here to choose one</small></span></>}</button>
        <button className="cs-btn go">Draw it</button>
        {said && <p role="alert">{said}</p>}
      </form></>}
  </div></div>;
  /* eslint-enable @next/next/no-img-element */
}
