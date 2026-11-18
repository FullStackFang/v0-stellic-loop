'use client';

import { useRef, useState } from 'react';
import { makeFaceAction } from '@/app/c/actions';

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

/**
 * "Create your own" in the account card: a photo of an animal, drawn as one of the set. It is premium, and there is no
 * payment yet: the first time, the person is asked to subscribe, told so, and given the picture free. What they asked
 * is kept (lib/campus/custom-face.ts).
 */
export function OwnFace({ asked, left, onMade, onBack }: { asked: boolean; left: number; onMade: (own: string, left: number) => void; onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null), [shown, setShown] = useState(''), [email, setEmail] = useState('');
  // Whether this visit began with the ask to subscribe: the thanks are shown for it until the pane is left.
  const [first] = useState(!asked), [state, setState] = useState<'form' | 'busy' | 'done'>('form'), [said, setSaid] = useState(''), [own, setOwn] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const choose = (next?: File) => { if (!next) return; if (shown) URL.revokeObjectURL(shown); setFile(next); setShown(URL.createObjectURL(next)); setSaid(''); };
  const make = async () => {
    if (!file) return setSaid('Choose a photo of an animal first.');
    if (first && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setSaid('Enter the email to subscribe with.');
    setSaid(''); setState('busy');
    const data = new FormData();
    data.set('photo', await small(file), 'photo.jpg'); if (first) data.set('email', email.trim());
    const got = await makeFaceAction(data).catch(() => ({ ok: false as const, message: 'That did not go through. Try again.' }));
    if (got.ok) { setOwn(got.own); setState('done'); onMade(got.own, got.left); } else { setSaid(got.message); setState('form'); }
  };
  const thanks = first && <p className="cs-own-thanks">Thanks for your interest. Payment is not set up yet, so this one is free. Enjoy your avatar.</p>;
  /* eslint-disable @next/next/no-img-element -- the person's own photo from their device, and the picture made from it */
  return <div className="cs-lvl-body cs-pets cs-own">
    <div className="cs-pets-top"><h4>Your own animal</h4><b className="cs-own-tag">Premium</b>{state !== 'busy' && <button className={`cs-btn sm ${state === 'done' ? 'go' : ''}`} onClick={onBack}>{state === 'done' ? 'Done' : 'Back'}</button>}</div>
    {state === 'done' ? <div className="cs-own-made"><img src={own} alt="Your own animal" />{thanks}<p>It is your picture now.{left > 0 ? ` You can make ${left} more.` : ''}</p></div>
    : state === 'busy' ? <div className="cs-own-made" role="status">{shown && <img className="busy" src={shown} alt="" />}{thanks}<p>Drawing your animal. This takes about half a minute.</p></div>
    : <form className="cs-own-form" onSubmit={event => { event.preventDefault(); void make(); }}>
      <p>Upload a photo of an animal, and Loop draws it in this style as your picture.</p>
      <input ref={input} type="file" accept="image/*" hidden aria-label="Photo of an animal" onChange={event => choose(event.target.files?.[0])} />
      <button type="button" className="cs-own-photo" onClick={() => input.current?.click()}>{shown ? <><img src={shown} alt="" /><span>Change photo</span></> : <span>Choose a photo</span>}</button>
      {first ? <>
        <div className="cs-own-plan"><strong>Loop Premium</strong><span>$3 a month</span><small>Your own animal as your picture.</small></div>
        <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@school.edu" autoComplete="email" /></label>
        <button className="cs-btn go">Subscribe</button></>
      : <><p>{left > 0 ? `You can make ${left} more.` : 'You have made all of yours for now.'}</p><button className="cs-btn go" disabled={left <= 0}>Make it</button></>}
      {said && <p role="alert">{said}</p>}
    </form>}
  </div>;
  /* eslint-enable @next/next/no-img-element */
}
