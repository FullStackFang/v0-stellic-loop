'use client';

import { useEffect, useState } from 'react';
import { subscribeToSaveAction } from '@/app/c/actions';
import { GROUNDS_HREF, saveHref, SHAPES, type Shape, type Swatch } from '@/lib/campus/save-shapes';
import '@/app/c/save-face.css';
import { SeatsWord } from '@/components/loading/seats';

/** What Ink+ gives here. Nothing is charged for it yet, and the plate says so once the person has subscribed. */
const PERKS = ['Your picture, no mark', 'Everything in Ink'];
const DOWN = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></svg>;
const NOT_NOW = 'That did not go through. Try again.';

/**
 * "Save your picture" (openspec loop-save-picture, as approved on public/demo/mockups-avatar-download.html): pick a
 * shape and a ground, and take the picture out of the app. Free, with the Loop mark on it; "No mark" is Ink+. The
 * picture is made by the server (/c/save), which is also what says whether this person may leave the mark off: the
 * pane asks, and shows the Ink+ plan when the answer is no. `of` is a group, for its drawn picture; without it the
 * picture is the person's own.
 */
export function SaveFace({ of = null, onBack }: { of?: { orgId: string; loopId: string } | null; onBack: () => void }) {
  const [shape, setShape] = useState<Shape>('profile'), [ground, setGround] = useState('school'), [mark, setMark] = useState(true);
  const [swatches, setSwatches] = useState<Swatch[]>([]);
  // `plan` is the Ink+ plate, in the pane's place. `asking` is the email field in the button's place, `joined` whether they subscribed on this visit.
  const [plan, setPlan] = useState(false), [asking, setAsking] = useState(false), [joined, setJoined] = useState(false), [email, setEmail] = useState('');
  // `none` is why there is nothing to save: the server's own sentence.
  const [wait, setWait] = useState(false), [said, setSaid] = useState(''), [none, setNone] = useState('');
  useEffect(() => { fetch(GROUNDS_HREF).then(got => got.ok ? got.json() : []).then(setSwatches, () => {}); }, []);
  const shown = saveHref(shape, ground, mark, of, true);
  // The pictures that have arrived. Each shape is asked for as the pane opens, and each ground of the shape in view, so a
  // press shows a picture the browser already has. One that has not arrived leaves its frame, at its own size, empty.
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  const here = (href: string) => setArrived(had => had.has(href) ? had : new Set(had).add(href));
  const org = of?.orgId, group = of?.loopId;
  useEffect(() => {
    const scope = org && group ? { orgId: org, loopId: group } : null, keys = shape === 'sticker' ? [ground] : [ground, ...swatches.map(each => each.key)];
    const wanted = new Set([...(Object.keys(SHAPES) as Shape[]).map(each => saveHref(each, ground, mark, scope, true)), ...keys.map(each => saveHref(shape, each, mark, scope, true))]);
    for (const href of wanted) { const ahead = new Image(); ahead.onload = () => here(href); ahead.src = href; }
  }, [shape, ground, mark, swatches, org, group]);

  /** "No mark": the server says whether this person may. If not, the plan is shown. */
  const noMark = async () => {
    setSaid(''); setWait(true);
    const got = await fetch(saveHref(shape, ground, false, of, true)).catch(() => null);
    setWait(false);
    if (got?.ok) setMark(false); else if (got?.status === 403) setPlan(true); else setSaid(NOT_NOW);
  };
  const subscribe = async () => {
    if (!asking) return setAsking(true);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setSaid('Enter the email to subscribe with.');
    setSaid(''); setWait(true);
    const got = await subscribeToSaveAction(email.trim()).catch(() => ({ ok: false as const, message: NOT_NOW }));
    setWait(false);
    if (got.ok) { setJoined(true); setMark(false); } else setSaid(got.message);
  };
  /** Hands over the file: on a phone through its share sheet, which is where "Save Image" is; elsewhere as a download. */
  const save = async () => {
    setSaid(''); setWait(true);
    try {
      const got = await fetch(saveHref(shape, ground, mark, of));
      if (!got.ok) throw new Error(got.status === 403 || got.status === 409 ? await got.text() : NOT_NOW);
      const name = `${mark ? 'loop-' : ''}${SHAPES[shape].file}.png`, file = new File([await got.blob()], name, { type: 'image/png' });
      if (window.matchMedia?.('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else { const link = document.createElement('a'); link.href = URL.createObjectURL(file); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
    } catch (error) {
      // Closing the share sheet without picking anything is not a failure.
      if (!(error instanceof Error && error.name === 'AbortError')) setSaid(error instanceof Error && error.message ? error.message : NOT_NOW);
    }
    setWait(false);
  };

  if (plan) return <div className="cs-lvl-body cs-pets cs-own cs-save"><div className="cs-prem">
    <button className="cs-prem-back" onClick={() => { setPlan(false); setAsking(false); setSaid(''); }}>Back</button>
    <p className="cs-prem-kick">Loop Ink+</p>
    {joined ? <><p className="cs-prem-big said">You’re in. The mark is off.</p>
      <p className="cs-own-thanks">Thanks for subscribing to Loop Ink+. Payment is not set up yet, so this is free.</p></>
    : <><p className="cs-prem-big">$9.99 <small>a month</small></p>
      <div className="cs-prem-perks">{PERKS.map(perk => <span key={perk}>{perk}</span>)}</div></>}
    <form className="cs-prem-stub" onSubmit={event => { event.preventDefault(); void subscribe(); }}>
      {joined ? <button type="button" className="cs-btn go" disabled={wait} onClick={() => void save()}>{wait ? <SeatsWord word="Saving" plate /> : <>{DOWN}Save without the mark</>}</button>
      : asking ? <div className="cs-prem-join"><input type="email" value={email} onChange={event => setEmail(event.target.value)} aria-label="Email" placeholder="Email to subscribe with" autoComplete="email" autoFocus /><button className="cs-btn go" disabled={wait}>{wait ? <SeatsWord word="Subscribing" plate /> : 'Subscribe'}</button></div>
      : <button className="cs-btn go">Subscribe to Loop Ink+</button>}
      {said && <p role="alert">{said}</p>}
    </form>
  </div></div>;

  return <div className="cs-lvl-body cs-pets cs-own cs-save"><div className="cs-prem">
    <button className="cs-prem-back" onClick={onBack}>Done</button>
    <p className="cs-prem-kick">{of ? 'The group’s picture' : 'Your picture'}</p>
    {none ? <><p className="cs-prem-big said">Nothing to save yet.</p><div className="cs-prem-perks"><span>{none}</span></div><div className="cs-save-foot" /></>
    : <>
      <div className="cs-save-tabs" role="group" aria-label="Shape">{(Object.keys(SHAPES) as Shape[]).map(each => <button key={each} aria-pressed={shape === each} onClick={() => setShape(each)}>{SHAPES[each].name}</button>)}</div>
      {/* The picture as it will be saved: the same address as the file, made small. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- made for this person by /c/save */}
      <div className="cs-save-view"><div className={`cs-save-frame ${shape}`}><img className={arrived.has(shown) ? '' : 'wait'} src={shown} onLoad={() => here(shown)} alt={`The picture as a ${SHAPES[shape].name.toLowerCase()}`} onError={() => { fetch(shown).then(got => got.status === 409 ? got.text() : '').then(setNone, () => {}); }} /></div></div>
      {/* A sticker has no ground, so no colour to pick: the row keeps its place. */}
      <div className="cs-save-inks" role="group" aria-label="Colour" style={shape === 'sticker' ? { visibility: 'hidden' } : undefined}>{swatches.map(each => <button key={each.key} aria-label={each.name} aria-pressed={ground === each.key} style={{ '--c': each.colour } as React.CSSProperties} onClick={() => setGround(each.key)} />)}</div>
      <div className="cs-save-marks" role="group" aria-label="Loop mark"><button aria-pressed={mark} onClick={() => setMark(true)}>With the mark</button><button aria-pressed={!mark} disabled={wait} onClick={() => { if (mark) void noMark(); }}>No mark<b>Ink+</b></button></div>
      <div className="cs-prem-stub"><button className="cs-btn go" disabled={wait} onClick={() => void save()}>{wait ? <SeatsWord word="Saving" plate /> : <>{DOWN}Save</>}</button><p className="cs-prem-small">{SHAPES[shape].fits}</p>{said && <p role="alert">{said}</p>}</div>
    </>}
  </div></div>;
}
