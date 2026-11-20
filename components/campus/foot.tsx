'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Rings } from '@/components/LoopGlyphs';
import { animal } from '@/lib/campus/animals';
import { KITS, kitNow, pickKit } from './kit';
import './foot.css';

/** Who stands in the ticket, left to right: animals anyone may have. A narrow ticket holds the first few. */
const CROWD = [9, 25, 2, 30, 15, 21, 19, 31, 0, 27, 12, 6, 23];
const SIZE = 84, GAP = 60, ROOF = 330, FALL = 2100, STEP = 78;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n)), near = (d: number, reach: number) => Math.exp(-(d * d) / (2 * reach * reach));

/**
 * The foot of every page (public/demo/mockups-footer.html): a ticket with the crowd in it, then one bar with the small print and the
 * colours. The ways around are the top bar's, Assistants among them (components/campus/assistants-link.tsx).
 * `home` is where the wordmark leads.
 */
export function SiteFoot({ home = '/', kit: worn }: { home?: string; /** The colours the page it ends has put on (the front door, which turns from school to school). Then the foot wears them too, and has no colours of its own to pick. */ kit?: string }) {
  const foot = useRef<HTMLElement>(null), [count, setCount] = useState(0), [kit, setKit] = useState<string | null>(null);
  // How many fit is known only once the ticket has a width.
  useLayoutEffect(() => { const stage = foot.current!.querySelector<HTMLElement>('.cs-ft-stage')!; setCount(clamp(Math.floor((stage.clientWidth - 40) / STEP), 4, CROWD.length)); setKit(kitNow()); }, []);
  useEffect(() => { if (count) return crowdIn(foot.current!); }, [count]);
  // Inside a page that wears colours of its own, the foot is not a .cs box: a .cs takes the colours of the whole site, over the page it ends.
  return <footer className={worn ? "cs-ft" : "cs cs-ft"} ref={foot} data-kit={worn}>
    <div className="cs-ft-carry" aria-hidden="true"><div className="cs-ft-tk">
      <div className="cs-ft-stage"><small>Pick one up</small>
        {/* eslint-disable-next-line @next/next/no-img-element -- icons from public/animals */}
        {CROWD.slice(0, count).map(face => [<i key={`s${face}`} className="cs-ft-shade" />, <img key={face} className="cs-ft-pet" src={animal(face)} alt="" draggable={false} />])}</div>
      <div className="cs-ft-tear"><span className="cs-ft-admit">Admit everyone</span><div className="cs-ft-code" /></div>
    </div></div>
    <div className="cs-ft-bar"><Link className="cs-wm" href={home}><Rings />Loop</Link>
      <nav aria-label="Loop, at the foot">        <Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></nav>
      <div className="cs-ft-end"><small>© 2026 Loop</small>
        {!worn && <div className="cs-ft-kits" role="group" aria-label="Colours">{KITS.map(each => <button key={each.slug} data-kit={each.slug} aria-label={`${each.name} colours`} title={each.name} aria-pressed={kit === each.slug} onClick={() => { pickKit(each.slug); setKit(each.slug); }} />)}</div>}</div></div>
  </footer>;
}

type One = { el: HTMLElement; shade: HTMLElement; x: number; vx: number; y: number; vy: number; r: number; vr: number; lift: number; vl: number; held: boolean };

/**
 * Brings the crowd in the ticket to life, and returns what stops it. Each one has a place along the floor (x) and a
 * height above it (y). They look at the pointer or the link it is on, can be picked up and thrown, flip when poked,
 * slide and pile up when the ticket is tipped, and cheer when the colours change. With reduced motion they stand still.
 */
function crowdIn(foot: HTMLElement): () => void {
  const carry = foot.querySelector<HTMLElement>('.cs-ft-carry')!, paper = foot.querySelector<HTMLElement>('.cs-ft-tk')!, stage = foot.querySelector<HTMLElement>('.cs-ft-stage')!;
  const pets = [...stage.querySelectorAll<HTMLElement>('.cs-ft-pet')], count = pets.length;
  let wide = stage.clientWidth;
  const slot = (rank: number) => 20 + rank * (wide - 40 - SIZE) / Math.max(1, count - 1);
  const crowd: One[] = pets.map((el, at) => ({ el, shade: el.previousElementSibling as HTMLElement, x: slot(at), vx: 0, y: 0, vy: 0, r: 0, vr: 0, lift: 0, vl: 0, held: false }));
  const draw = (one: One) => {
    one.el.style.transform = `translate(${one.x.toFixed(1)}px, ${(-one.y - one.lift).toFixed(1)}px) rotate(${one.r.toFixed(1)}deg)`;
    const high = clamp((one.y + one.lift) / 220, 0, 1);
    one.shade.style.transform = `translateX(${one.x.toFixed(1)}px) scale(${(.74 - high * .4).toFixed(2)})`; one.shade.style.opacity = (1 - high * .75).toFixed(2);
  };
  crowd.forEach(draw);
  const off = new AbortController(), on = { signal: off.signal };
  // Where the browser cannot say, or cannot tell when the ticket is in view, they stand still too.
  if (typeof matchMedia !== 'function' || typeof IntersectionObserver !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    addEventListener('resize', () => { wide = stage.clientWidth; crowd.forEach((one, at) => { one.x = slot(at); draw(one); }); }, on);
    return () => off.abort();
  }
  addEventListener('resize', () => { wide = stage.clientWidth; }, on);

  // The ticket: a spring to where the hand has it.
  const tk = { x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0, tx: 0, ty: 0, tr: 0, wasV: 0 };
  let hand: { x: number; y: number } | null = null, pointer: { x: number; y: number } | null = null, pill: number | null = null, grabbed: One | null = null;
  let seen = false, running = false, last = 0, frame = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>(), later = (run: () => void, ms: number) => { const id = setTimeout(() => { timers.delete(id); run(); }, ms); timers.add(id); };
  /** Where on the floor a point of the window is. */
  const onFloor = (clientX: number, clientY: number) => { const box = stage.getBoundingClientRect(); return { x: clientX - box.left, y: box.bottom - 7 - clientY }; };

  function tick(now: number) {
    const dt = Math.min(.032, (now - last) / 1000) || .016; last = now;
    const stiff = hand ? 420 : 120, damp = hand ? 30 : 9;
    tk.vx += ((tk.tx - tk.x) * stiff - tk.vx * damp) * dt; tk.x += tk.vx * dt;
    tk.vy += ((tk.ty - tk.y) * stiff - tk.vy * damp) * dt; tk.y += tk.vy * dt;
    tk.vr += ((tk.tr - tk.r) * stiff - tk.vr * damp) * dt; tk.r += tk.vr * dt;
    carry.style.transform = `translate(${tk.x.toFixed(1)}px, ${tk.y.toFixed(1)}px) rotate(${tk.r.toFixed(2)}deg)`;
    // What the ticket does to those in it: a tipped floor is a slope, and a ticket that is snatched away leaves them behind for a moment.
    const slope = 2900 * Math.sin(tk.r * Math.PI / 180), jolt = clamp((tk.vx - tk.wasV) / dt, -7000, 7000) * .8; tk.wasV = tk.vx;
    const calm = !hand && Math.abs(tk.r) < 1.1;
    // Each one's own place is by where they stand now, so one dropped in a new spot keeps it and the rest move along.
    const order = crowd.filter(one => !one.held).sort((a, b) => a.x - b.x), spare = count - order.length;
    const look = grabbed ? grabbed.x + SIZE / 2 : pill ?? pointer?.x ?? null;

    for (const one of crowd) {
      if (one.held) continue;
      const air = one.y > 0, home = slot(order.indexOf(one) + (grabbed && grabbed.x < one.x ? spare : 0));
      one.vx += (slope - jolt + (calm && !air ? (home - one.x) * 14 : 0) - one.vx * (air ? .5 : 3.4)) * dt; one.x += one.vx * dt;
      if (air || one.vy > 0) {
        one.vy -= FALL * dt; one.y += one.vy * dt;
        if (one.y > ROOF) { one.y = ROOF; one.vy = -Math.abs(one.vy) * .4; }
        if (one.y <= 0) { one.y = 0; one.vy = one.vy < -300 ? -one.vy * .36 : 0; one.vr += one.vx * .5; }
      }
      if (one.x < 4) { one.x = 4; one.vx = Math.abs(one.vx) * .45; } else if (one.x > wide - SIZE - 4) { one.x = wide - SIZE - 4; one.vx = -Math.abs(one.vx) * .45; }
    }
    // Two on the floor cannot share a spot: they part, pass the push along, and a hard bump makes both hop.
    const floor = crowd.filter(one => !one.held && one.y < 40).sort((a, b) => a.x - b.x);
    for (let pass = 0; pass < 2; pass++) for (let at = 0; at < floor.length - 1; at++) {
      const a = floor[at], b = floor[at + 1], over = GAP - (b.x - a.x);
      if (over <= 0) continue;
      a.x -= over / 2; b.x += over / 2;
      const hit = a.vx - b.vx;
      if (hit > 0) { const mean = (a.vx + b.vx) / 2; a.vx = mean - hit * .2; b.vx = mean + hit * .2; if (hit > 260 && a.y === 0 && b.y === 0) a.vy = b.vy = Math.min(hit * .45, 330); }
    }
    let moving = !!hand || !!grabbed || Math.abs(tk.vx) + Math.abs(tk.vy) + Math.abs(tk.vr) > .05 || Math.abs(tk.tx - tk.x) + Math.abs(tk.ty - tk.y) + Math.abs(tk.tr - tk.r) > .05;
    for (const one of crowd) {
      const dx = look === null ? 0 : look - (one.x + SIZE / 2), close = look === null ? 0 : near(dx, 110);
      // They turn to what they are looking at, lean into a run, and try to stay upright on a tipped ticket.
      const turn = one.held ? clamp(-one.vx * .045, -38, 38) : clamp(dx / 380, -1, 1) * 11 * (1 - close * .6) + clamp(one.vx * .04, -18, 18) - tk.r * .7;
      one.vr += ((turn - one.r) * 150 - one.vr * 13) * dt; one.r += one.vr * dt;
      const tiptoe = one.held || one.y > 0 || pill !== null || grabbed || !pointer ? 0 : 15 * close;
      one.vl += ((tiptoe - one.lift) * 190 - one.vl * 15) * dt; one.lift += one.vl * dt;
      if (one.y > 0 || Math.abs(one.vx) + Math.abs(one.vy) + Math.abs(one.vr) + Math.abs(one.vl) > .3 || Math.abs(turn - one.r) + Math.abs(tiptoe - one.lift) > .05) moving = true;
      draw(one);
    }
    // At rest and out of view there is nothing to draw: the loop stops until something stirs.
    if (seen && moving) frame = requestAnimationFrame(tick); else running = false;
  }
  const wake = () => { if (!running) { running = true; last = performance.now(); frame = requestAnimationFrame(tick); } };
  const hop = (one: One, speed: number) => { if (!one.held && one.y === 0) { one.vy = speed; wake(); } };

  // They are dropped into the ticket the first time it comes into view, and the scene rests while it is out of view.
  let arrived = false;
  const watch = new IntersectionObserver(([entry]) => {
    seen = entry.isIntersecting;
    if (seen && !arrived) { arrived = true; crowd.forEach((one, at) => { one.y = 300 + at * 34 + (at % 3) * 60; one.vy = -200; one.r = (at % 2 ? 1 : -1) * 40; }); }
    if (seen) wake();
  }, { threshold: .25 });
  watch.observe(carry);

  // Looking: at the pointer, or at the link it is on. The one nearest a link hops, as if to say "that one".
  foot.addEventListener('pointermove', event => { pointer = onFloor(event.clientX, event.clientY); if (!hand) { const box = carry.getBoundingClientRect(); tk.tr = clamp((event.clientX - box.left) / box.width - .5, -.5, .5) * 1.2; } wake(); }, on);
  foot.addEventListener('pointerleave', () => { pointer = null; if (!hand) tk.tr = 0; wake(); }, on);
  const nearest = (x: number) => crowd.filter(one => !one.held).reduce((best, one) => Math.abs(one.x + SIZE / 2 - x) < Math.abs(best.x + SIZE / 2 - x) ? one : best);
  foot.querySelectorAll<HTMLElement>('.cs-ft-bar a, .cs-ft-bar button').forEach(link => {
    link.addEventListener('pointerenter', () => { const box = link.getBoundingClientRect(); pill = clamp(onFloor(box.left + box.width / 2, 0).x, 0, wide); hop(nearest(pill), 430); wake(); }, on);
    link.addEventListener('pointerleave', () => { pill = null; wake(); }, on);
    // Colours: the page changes, and they cheer from one end to the other.
    if (link.matches('button')) link.addEventListener('click', () => [...crowd].sort((a, b) => b.x - a.x).forEach((one, at) => later(() => { if (!one.held && one.y === 0) one.r -= 360; hop(one, 520); }, at * 55)), on);
  });

  // Picking one up. It hangs from the hand and swings; let go and it flies with the throw. A press with no pull is a poke: a flip, and those beside it hop.
  for (const one of crowd) one.el.addEventListener('pointerdown', event => {
    event.stopPropagation(); event.preventDefault(); one.el.setPointerCapture(event.pointerId);
    const from = onFloor(event.clientX, event.clientY), grip = { x: from.x - one.x, y: from.y - one.y }, done = new AbortController(), until = { signal: done.signal };
    let far = 0, when = performance.now();
    one.el.addEventListener('pointermove', move => {
      const at = onFloor(move.clientX, move.clientY), now = performance.now(), dt = Math.max(.008, (now - when) / 1000), x = at.x - grip.x, y = Math.max(0, at.y - grip.y); when = now;
      far = Math.max(far, Math.hypot(at.x - from.x, at.y - from.y));
      if (far > 6 && !one.held) { one.held = true; grabbed = one; one.el.classList.add('up'); }
      if (!one.held) return;
      one.vx = one.vx * .55 + (x - one.x) / dt * .45; one.vy = one.vy * .55 + (y - one.y) / dt * .45; one.x = x; one.y = y; wake();
    }, until);
    const up = () => {
      done.abort();
      if (one.held) { one.held = false; grabbed = null; one.el.classList.remove('up'); one.vx = clamp(one.vx, -2200, 2200); one.vy = clamp(one.vy, -1600, 1900); if (one.y === 0 && one.vy <= 0) one.vy = 0; wake(); return; }
      if (one.y === 0) one.r += one.x > wide / 2 ? 360 : -360;
      hop(one, 640);
      crowd.forEach(other => { const away = Math.abs(other.x - one.x); if (other !== one && away < 300) later(() => hop(other, 420 - away), away * 1.1); });
    };
    one.el.addEventListener('pointerup', up, until); one.el.addEventListener('pointercancel', up, until);
  }, on);

  // Picking the ticket up. Tip it and they slide to the low end and pile up; let go and it swings back, they jump, and then they find their places.
  // Touch scrolls the page as ever (touch-action: pan-y); the ticket is picked up with a mouse or a pen.
  paper.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || (event.target as Element).closest('.cs-ft-pet')) return;
    hand = { x: event.clientX, y: event.clientY }; paper.setPointerCapture(event.pointerId); carry.classList.add('held'); wake();
  }, on);
  paper.addEventListener('pointermove', event => {
    if (!hand) return;
    const dx = event.clientX - hand.x, dy = event.clientY - hand.y;
    tk.tx = dx * .7; tk.ty = dy * .55; tk.tr = clamp(dx * .022 + dy * (hand.x > innerWidth / 2 ? .03 : -.03), -9, 9); wake();
  }, on);
  const drop = () => { if (!hand) return; hand = null; carry.classList.remove('held'); tk.tx = tk.ty = tk.tr = 0; crowd.forEach((one, at) => hop(one, 300 + 140 * Math.sin(at * 1.7))); wake(); };
  paper.addEventListener('pointerup', drop, on); paper.addEventListener('pointercancel', drop, on);

  // Left alone, one of them gets restless now and then.
  const restless = setInterval(() => { if (seen && !pointer && !hand && !grabbed && !document.hidden) hop(crowd[Math.floor(Math.random() * crowd.length)], 330); }, 2600);

  return () => { off.abort(); watch.disconnect(); clearInterval(restless); timers.forEach(clearTimeout); cancelAnimationFrame(frame); carry.style.transform = ''; };
}
