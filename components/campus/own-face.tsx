'use client';

import { useRef, useState } from 'react';
import { makeFaceAction, subscribeAction } from '@/app/c/actions';
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
const PERKS = ['Your own animal, drawn from your photo', 'Every premium animal', 'Your plans lifted to the top for a day', 'New rewards a week early'];

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
  return <div className="cs-lvl-body cs-pets cs-own">
    <div className="cs-pets-top"><h4>Your own animal</h4><b className="cs-own-tag">Premium</b>{state !== 'busy' && <button className={`cs-btn sm ${state === 'done' ? 'go' : ''}`} onClick={onBack}>{state === 'done' ? 'Done' : 'Back'}</button>}</div>
    {state === 'done' ? <div className="cs-own-made"><img src={own} alt="Your own animal" />{thanks}<p>It is your picture now.</p></div>
    // The free animal is used: say so here, before a photo is chosen, not after.
    : left <= 0 && state === 'photo' ? <div className="cs-own-made"><p>You have made your free animal. Making more is not set up yet.</p></div>
    : state === 'busy' ? <div className="cs-own-made" role="status">{shown && <img className="busy" src={shown} alt="" />}{thanks}<p>Drawing your animal. This takes about half a minute.</p></div>
    : <form className="cs-own-form" onSubmit={event => { event.preventDefault(); void make(); }}>
      {thanks}
      <input ref={input} type="file" accept="image/*" hidden aria-label="Photo of an animal" onChange={event => choose(event.target.files?.[0])} />
      <button type="button" className="cs-own-photo" onClick={() => input.current?.click()}>{shown ? <><img src={shown} alt="" /><span>Change photo</span></> : <span>Choose a photo of an animal</span>}</button>
      <button className="cs-btn go">Draw it</button>
      {said && <p role="alert">{said}</p>}
    </form>}
  </div>;
  /* eslint-enable @next/next/no-img-element */
}
