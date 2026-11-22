import { inkBlot } from '@/lib/campus/ink-blot';

/**
 * Seats, the doodle: one game with three modes on one clock (public/demo/mockups-seats-game.html, picked by the founder).
 *   Chart       a matching game: twelve tiles, six animals twice. Look, flip them over, turn two at a time.
 *   Table       eight chairs, each a colour. Kick them out, the chairs turn, and each goes back by its colour.
 *   Who moved?  twelve on the ticket. The lights go out, some swap seats, and you tap the ones that moved. Five rounds.
 * A mistake costs 2 seconds in every mode, and the clock stops at a minute: the round is lost.
 * It is drawn by hand into one element and not in React: nothing here is the page's state, and the Table moves each frame.
 */
export type SeatsPlayer = { /** Ink or Ink+: one of their own animals plays. */ ink: boolean; /** Ink+: it sparkles, and the boards wear their blot. */ plus?: boolean; animals: { face: number; picture: string | null }[] } | null;
type Mode = 'a' | 'c' | 't';
type State = 'look' | 'play' | 'done' | 'lost';
type Game = { /** A new round, with whoever is playing now. */ fresh: () => void };
type Kit = {
  reduce: boolean; root: HTMLElement; faces: () => string[]; spark: () => boolean;
  later: (run: () => void, ms: number) => number; every: (run: () => void, ms: number) => number; stop: (id: number) => void;
  /** A round was won in this time: true when it is the player's best yet in this mode. */
  won: (mode: Mode, took: number) => boolean; alive: () => boolean;
};

export const WRONG = 2, MAX = 60;
const G = 2400, CROWD = [10, 26, 3, 31, 16, 22, 20, 1, 28, 13, 7, 24, 9], HUES = [25, 70, 115, 155, 200, 250, 300, 345];
export const MODES: readonly (readonly [Mode, string])[] = [['a', 'Chart'], ['c', 'Table'], ['t', 'Who moved?']];
const BACK = 'Put each one back. A wrong place costs 2 seconds.';
const HOW: Record<Mode, readonly [string, string, string]> = {
  a: ['Every animal is on the chart twice. Remember the pairs.', 'Flip them over. The clock starts.', 'Flip two to find a pair. A miss costs 2 seconds.'],
  c: ['Remember the colour of each one\'s chair.', 'Kick them out. The chairs start turning.', BACK],
  t: ['Remember who sits where.', 'Lights out. Some of them swap seats.', 'Tap the ones that moved. A wrong tap costs 2 seconds.'],
};
const BOARD: Record<Mode, string> = {
  a: `<div class="board a"><div class="clock"><span data-clock>0.0</span><small data-say data-play="seconds. Flip two to find a pair." data-done="seconds" data-lost="seconds. Out of time.">seconds. Remember the pairs.</small></div>
    <div class="chart"></div><div class="punch"><b>All paired</b><span class="best">your best yet</span></div><button class="go" type="button"></button></div>`,
  c: `<div class="board c"><div class="edge top"></div><div class="edge low"></div><div class="rug"></div>
    <span class="tag" data-say data-play="The chairs are turning. Go by colour." data-done="All in" data-lost="Out of time">Remember each one's colour</span>
    <div class="table"><span class="clock" data-clock>0.0</span><small>seconds</small></div><button class="go" type="button"></button></div>`,
  t: `<div class="board t"><div class="tk"><div class="lights"></div></div><span class="tag" data-say data-done="All spotted" data-lost="Out of time">Remember who sits where</span>
    <div class="stubb"><span class="admit">Who moved?</span><span class="clock" data-clock>0.0</span></div>
    <span class="stamp">All spotted<span class="best">your best yet</span></span><div class="pips"></div><button class="go" type="button"></button></div>`,
};

const animal = (n: number) => `/animals/${String(n).padStart(2, '0')}.webp`;
const rand = (low: number, high: number) => low + Math.random() * (high - low);
const mixed = (n: number) => { const order = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } return order; };
/** Signs the player up for Ink (app/c/ink/join), and gives back the thanks to show. Someone signed out is sent to sign in. */
async function signUp(): Promise<string | null> {
  const answer = await fetch('/c/ink/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: 'ink', place: 'seats: Get Ink', back: location.pathname }) }).catch(() => null);
  const got = await answer?.json().catch(() => null) as { ok?: boolean; said?: string; signIn?: string } | null;
  if (got?.signIn) location.assign(got.signIn);
  return got?.ok && got.said ? got.said : null;
}
/** Lets an animation that has played be played again. */
const again = (el: Element, name: string) => { el.classList.remove(name); void (el as HTMLElement).offsetWidth; el.classList.add(name); };
const find = <T extends Element = HTMLElement>(root: Element, what: string) => root.querySelector<T>(what)!;
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => Object.assign(document.createElement(tag), { className });
/** The mark of Ink (components/campus/ink-mark.tsx): the blot alone, in the school's two inks. */
const inkMark = () => blotSvg('Loopd Ink').replace('class="blot" viewBox="-80 -80 160 160"', 'class="mark" viewBox="-68 -68 136 136"');
/** The app's ink blot (lib/campus/ink-blot.ts), as the faces with Ink sit on. */
const blotSvg = (seed: string) => { const blot = inkBlot(seed), drops = (rounds: readonly (readonly [number, number, number])[]) => rounds.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
  return `<svg class="blot" viewBox="-80 -80 160 160" aria-hidden="true"><g class="school"><path d="${blot.school}"/>${drops(blot.schoolDrops)}</g><path class="seep" d="${blot.seep}"/><g class="dark"><path d="${blot.dark}"/>${drops(blot.darkDrops)}</g></svg>`; };
/** What a wrong move cost, rising from where it happened. */
function charge(kit: Kit, board: HTMLElement, x: number, y: number) { const cost = Object.assign(make('b', 'cost'), { textContent: `+${WRONG}s` }); cost.style.left = `${x}px`; cost.style.top = `${y}px`; board.append(cost); kit.later(() => cost.remove(), 900); }
/** The words, the button and the state every mode shows the same way. */
function told(board: HTMLElement, state: State, shown: number, record: boolean, words: string, look: string) {
  board.classList.remove('look', 'play', 'done', 'lost'); board.classList.add(state);
  find(board, '[data-clock]').textContent = shown.toFixed(1);
  const say = find(board, '[data-say]'); say.textContent = say.dataset[state] ?? words;
  find(board, '.go').textContent = state === 'look' ? look : state === 'play' ? 'Start over' : 'Again';
  board.querySelectorAll('.best').forEach(el => el.classList.toggle('on', record));
}

/** Chart. A pair stays up; a miss costs 2 seconds and turns back. */
function pairs(board: HTMLElement, kit: Kit): Game {
  const chart = find(board, '.chart'), words = find(board, '[data-say]').textContent ?? '';
  const tiles = Array.from({ length: 12 }, (_, i) => { const el = make('button', 'tile'); el.type = 'button'; el.style.setProperty('--i', String(i));
    // the blot on a back is made from where the tile sits, never from the animal under it, so the backs give nothing away
    el.innerHTML = `<span class="face"><img alt="" draggable="false"></span><span class="back">${blotSvg(`seat ${i}`)}</span>`; chart.append(el); return { el, face: '', open: true, found: false }; });
  let state: State = 'look', began = 0, fine = 0, took = 0, timer = 0, record = false, first: typeof tiles[number] | null = null, busy = 0;
  const elapsed = () => (performance.now() - began) / 1000 + fine;
  function tell() {
    if (state === 'play' && elapsed() >= MAX) { kit.stop(timer); took = MAX; state = 'lost'; }
    told(board, state, state === 'look' ? 0 : state === 'play' ? elapsed() : took, state === 'done' && record, words, 'Flip them over');
    for (const tile of tiles) { tile.el.classList.toggle('down', !tile.open); tile.el.classList.toggle('found', tile.found); tile.el.disabled = state !== 'play' || tile.open; tile.el.setAttribute('aria-label', tile.open ? 'An animal' : 'Face down'); }
  }
  function fresh() { kit.stop(timer); kit.stop(busy); busy = 0; first = null; state = 'look'; board.classList.remove('wave'); const faces = kit.faces();
    mixed(12).forEach((at, i) => { const tile = tiles[at]; tile.face = faces[i >> 1]; tile.open = true; tile.found = false; find<HTMLImageElement>(tile.el, 'img').src = tile.face; tile.el.querySelector('.spark')?.remove();
      if (i < 2 && kit.spark()) find(tile.el, '.face').append(make('i', 'spark')); }); tell(); }
  function flip() { state = 'play'; began = performance.now(); fine = 0; again(chart, 'jolt'); board.classList.add('wave'); kit.later(() => board.classList.remove('wave'), 800); for (const tile of tiles) tile.open = false; tell(); timer = kit.every(tell, 100); }
  function pick(tile: typeof tiles[number]) { if (state !== 'play' || tile.open || busy) return; tile.open = true; if (!first) { first = tile; return tell(); }
    const other = first; first = null;
    if (other.face === tile.face) { other.found = tile.found = true; if (tiles.every(each => each.found)) { kit.stop(timer); took = Math.round(elapsed() * 10) / 10; state = 'done'; record = kit.won('a', took); } return tell(); }
    fine += WRONG; tell(); again(other.el, 'no'); again(tile.el, 'no'); charge(kit, board, chart.offsetLeft + tile.el.offsetLeft + tile.el.offsetWidth / 2, chart.offsetTop + tile.el.offsetTop + 14);
    busy = kit.later(() => { busy = 0; other.open = tile.open = false; tell(); }, 750); }
  tiles.forEach(tile => tile.el.addEventListener('click', () => pick(tile)));
  find(board, '.go').addEventListener('click', () => state === 'look' ? flip() : fresh());
  fresh();
  return { fresh };
}

/** Who moved? Five rounds; between them a look at the new seats, shorter each time, which the clock waits for. */
function moved(board: HTMLElement, kit: Kit): Game {
  const tk = find(board, '.tk'), pips = find(board, '.pips'), plate = find(board, '.admit'), words = find(board, '[data-say]').textContent ?? '';
  const ROUNDS = [1, 1, 1, 2, 2], LOOK = [10, 8, 6, 5], HINT = 10000, HINT_AGAIN = 4000;
  find(tk, '.lights').innerHTML = blotSvg('lights out'); pips.innerHTML = ROUNDS.map((_, i) => `<i>${i + 1}</i>`).join('');
  const spots = Array.from({ length: 12 }, () => { const el = make('button', 'spot'); el.type = 'button'; el.innerHTML = '<img alt="" draggable="false">'; tk.append(el); return { el, face: '', moved: false, hit: false }; });
  let state: State = 'look', began = 0, fine = 0, took = 0, timer = 0, record = false, at = 0, wait = 0, dark = false, hold = false, look = 0, lookFrom = 0, off = 0, since = 0;
  const elapsed = () => ((lookFrom || performance.now()) - began - off) / 1000 + fine;
  // no spark on your own animal here: it would show whether yours moved
  const show = (spot: typeof spots[number]) => { find<HTMLImageElement>(spot.el, 'img').src = spot.face; };
  function tell() {
    if (state === 'play' && elapsed() >= MAX) { kit.stop(timer); kit.stop(wait); dark = hold = false; look = 0; took = MAX; state = 'lost'; }
    told(board, state, state === 'look' ? 0 : state === 'play' ? elapsed() : took, state === 'done' && record, words, 'Lights out');
    board.classList.toggle('dark', dark); board.classList.toggle('rest', state === 'play' && look > 0);
    const left = spots.filter(spot => spot.moved && !spot.hit).length, total = spots.filter(spot => spot.moved).length;
    if (state === 'play') { find(board, '[data-say]').textContent = dark ? 'Lights out' : look ? 'Remember the new seats' : left ? `${total} moved. Tap them.` : 'Got them'; if (look) find(board, '.go').textContent = 'Lights out'; }
    // the plate on the stub counts them down, so how many are left is always in one place
    plate.textContent = state !== 'play' ? 'Who moved?' : dark ? 'Lights out' : look ? `Look: ${look}` : left ? `${left} to find` : 'Got them';
    for (const spot of spots) { spot.el.classList.toggle('hit', spot.hit); spot.el.disabled = state !== 'play' || dark || hold || spot.hit; if (spot.hit || state !== 'play' || dark || hold) spot.el.classList.remove('hint'); }
    // stuck with nothing found: one of the ones that moved gives itself away, and again every few seconds
    if (state === 'play' && !dark && !hold && performance.now() - since > HINT) { const one = spots.find(spot => spot.moved && !spot.hit); if (one) again(one.el, 'hint'); since = performance.now() - HINT + HINT_AGAIN; }
    Array.from(pips.children).forEach((pip, i) => { pip.classList.toggle('on', state === 'play' && i === at); pip.classList.toggle('past', state === 'done' || state !== 'look' && i < at); });
  }
  // in the dark: this round's pairs change places
  function swapped() { const order = mixed(12).slice(0, ROUNDS[at] * 2); for (const spot of spots) spot.moved = spot.hit = false;
    for (let i = 0; i < order.length; i += 2) { const a = spots[order[i]], b = spots[order[i + 1]]; [a.face, b.face] = [b.face, a.face]; a.moved = b.moved = true; show(a); show(b); } }
  function dim() { dark = true; hold = false; tell(); wait = kit.later(() => { swapped(); wait = kit.later(() => { dark = false; since = performance.now(); tell(); }, 380); }, 480); }
  function fresh() { kit.stop(timer); kit.stop(wait); state = 'look'; at = 0; dark = hold = false; look = lookFrom = off = 0; const faces = kit.faces(); mixed(12).forEach((to, i) => { const spot = spots[to]; spot.face = faces[i]; spot.moved = spot.hit = false; show(spot); }); tell(); }
  function start() { state = 'play'; began = performance.now(); fine = 0; at = 0; off = 0; timer = kit.every(tell, 100); dim(); }
  function rest() { for (const spot of spots) spot.moved = spot.hit = false; look = LOOK[at]; lookFrom = performance.now(); tell();
    const tick = () => { look--; if (look > 0) { tell(); wait = kit.later(tick, 1000); return; } on(); }; wait = kit.later(tick, 1000); }
  /** The look ends by itself, or at once from the button. */
  function on() { kit.stop(wait); off += performance.now() - lookFrom; lookFrom = 0; look = 0; at++; dim(); }
  function pick(spot: typeof spots[number]) { if (state !== 'play' || dark || hold || spot.hit) return;
    if (!spot.moved) { fine += WRONG; again(spot.el, 'no'); charge(kit, board, tk.offsetLeft + spot.el.offsetLeft + spot.el.offsetWidth / 2, tk.offsetTop + spot.el.offsetTop + 62); return tell(); }
    spot.hit = true; since = performance.now(); if (spots.some(each => each.moved && !each.hit)) return tell();
    if (at === ROUNDS.length - 1) { kit.stop(timer); took = Math.round(elapsed() * 10) / 10; state = 'done'; record = kit.won('t', took); return tell(); }
    hold = true; tell(); wait = kit.later(rest, 450); }
  spots.forEach(spot => spot.el.addEventListener('click', () => pick(spot)));
  find(board, '.go').addEventListener('click', () => state === 'look' ? start() : state === 'play' && look ? on() : fresh());
  fresh();
  return { fresh };
}

type Place = { x: number; y: number; s: number; cy?: number };
type Pet = { el: HTMLImageElement; mine: boolean; home: number; in: boolean; held: boolean; air: boolean; x: number; y: number; s: number; tx: number; ty: number; ts: number; vx: number; vy: number; wait: number; spot: Place };
const ring = (places: Place[], angle: number) => places.forEach((place, i) => { const turn = (i * 45 - 90) * Math.PI / 180 + angle; place.x = 180 + Math.cos(turn) * 126; place.y = 292 + Math.sin(turn) * 126 + 22; });

/** Table. Each is pulled to its place by a spring that settles without overshooting; the kick throws them in a plain arc that lands with no bounce. */
function table(board: HTMLElement, kit: Kit): Game {
  const SPIN = .24, places: Place[] = HUES.map(() => ({ x: 0, y: 0, s: .66, cy: -22 })), n = places.length, words = find(board, '[data-say]').textContent ?? '', { reduce } = kit; ring(places, 0);
  const floor = (i: number): Place => ({ x: 52 + (i >> 1) * 85 + rand(-8, 8), y: i % 2 ? 122 : 552, s: .7 });
  const put = (el: HTMLElement, i: number) => { el.style.left = `${places[i].x.toFixed(1)}px`; el.style.top = `${(places[i].y + (places[i].cy ?? 0)).toFixed(1)}px`; };
  const seats = places.map((_, i) => { const el = make('i', 'seat'); el.style.setProperty('--i', String(i)); el.style.setProperty('--hue', `oklch(82% 0.13 ${HUES[i]})`); put(el, i); board.append(el); return el; });
  const crowd: Pet[] = places.map((_, i) => { const el = make('img', 'pet'); el.alt = ''; el.draggable = false; board.append(el); return { el, mine: i === 0, home: i, in: true, held: false, air: false, x: 0, y: 0, s: 1, tx: 0, ty: 0, ts: 1, vx: 0, vy: 0, wait: 0, spot: places[i] }; });
  const spark = make('i', 'spark'); board.append(spark);
  let state: State = 'look', began = 0, fine = 0, took = 0, timer = 0, record = false, running = false, last = 0, angle = 0;
  const elapsed = () => (performance.now() - began) / 1000 + fine;
  const draw = (one: Pet) => { one.el.style.transform = `translate(${(one.x - 42).toFixed(1)}px, ${(one.y - 84).toFixed(1)}px) scale(${one.s.toFixed(3)})`; one.el.style.zIndex = String(one.held ? 50 : 10 + Math.round(one.y / 8));
    if (one.mine) spark.style.transform = `translate(${(one.x + 30 * one.s).toFixed(1)}px, ${(one.y - 74 * one.s).toFixed(1)}px)`; };
  const wake = () => { if (!running && kit.alive()) { running = true; last = performance.now(); requestAnimationFrame(step); } };
  function step(now: number) { if (!kit.alive()) return; const dt = Math.min(.032, (now - last) / 1000) || .016; last = now; let moving = false;
    // while the round is on, the chairs go round, and whoever is seated goes with them
    if (state === 'play' && !reduce) { angle += dt * SPIN; ring(places, angle); seats.forEach(put); for (const one of crowd) if (one.in) { one.tx = places[one.home].x; one.ty = places[one.home].y; } moving = true; }
    for (const one of crowd) { if (one.held) { moving = true; continue; } if (one.wait > 0) { one.wait -= dt; moving = true; continue; }
      one.s += (one.ts - one.s) * Math.min(1, dt * 14);
      if (one.air) { one.vy += G * dt; one.x += one.vx * dt; one.y += one.vy * dt; if (one.vy > 0 && one.y >= one.ty) { one.air = false; one.x = one.tx; one.y = one.ty; one.vx = one.vy = 0; } draw(one); moving = true; continue; }
      const k = 340, c = 2 * Math.sqrt(k);
      one.vx += (k * (one.tx - one.x) - c * one.vx) * dt; one.vy += (k * (one.ty - one.y) - c * one.vy) * dt; one.x += one.vx * dt; one.y += one.vy * dt;
      if (Math.abs(one.tx - one.x) + Math.abs(one.ty - one.y) + Math.abs(one.vx) + Math.abs(one.vy) > .4) moving = true; else { one.x = one.tx; one.y = one.ty; one.s = one.ts; } draw(one); }
    if (moving) requestAnimationFrame(step); else running = false; }
  const send = (one: Pet, to: Place, wait = 0) => { one.air = false; one.tx = to.x; one.ty = to.y; one.ts = to.s; one.wait = reduce ? 0 : wait; if (reduce) { one.x = to.x; one.y = to.y; one.s = to.s; draw(one); } wake(); };
  const toss = (one: Pet, to: Place, wait: number) => { if (reduce) return send(one, to); one.tx = to.x; one.ty = to.y; one.ts = to.s; one.wait = wait; one.air = true;
    one.vy = -Math.sqrt(2 * G * (one.y - Math.min(one.y, to.y) + rand(50, 90))); const flight = (-one.vy + Math.sqrt(one.vy * one.vy + 2 * G * (to.y - one.y))) / G; one.vx = (to.x - one.x) / flight; wake(); };
  function tell() {
    if (state === 'play' && elapsed() >= MAX) { kit.stop(timer); took = MAX; state = 'lost'; }
    told(board, state, state === 'look' ? 0 : state === 'play' ? elapsed() : took, state === 'done' && record, words, 'Kick them out');
    seats.forEach((el, i) => el.classList.toggle('taken', crowd.some(one => one.in && one.home === i)));
  }
  function fresh() { kit.stop(timer); state = 'look'; angle = 0; ring(places, 0); seats.forEach(put); const order = mixed(n), faces = kit.faces(); spark.hidden = !kit.spark();
    crowd.forEach((one, i) => { one.el.src = faces[i]; one.home = order[i]; one.in = true; one.held = false; one.el.classList.add('in'); one.el.classList.remove('up'); send(one, places[one.home], i * .02); }); tell(); }
  function kick() { state = 'play'; began = performance.now(); fine = 0; again(find(board, '.table'), 'thump');
    const order = mixed(n); crowd.forEach((one, i) => { one.in = false; one.el.classList.remove('in'); one.spot = floor(order[i]); toss(one, one.spot, .08 + order[i] * .035); });
    tell(); timer = kit.every(tell, 100); }
  const nearest = (one: Pet) => { let pick: number | null = null, far = 50; places.forEach((place, i) => { if (crowd.some(other => other.in && other.home === i)) return; const d = Math.hypot(place.x - one.x, place.y - one.y); if (d < far) { far = d; pick = i; } }); return pick as number | null; };
  for (const one of crowd) { let grip = { x: 0, y: 0 };
    const at = (event: PointerEvent) => { const box = board.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; };
    one.el.addEventListener('pointerdown', event => { event.preventDefault(); if (state !== 'play' || one.in) return; one.el.setPointerCapture?.(event.pointerId); const p = at(event);
      one.held = true; one.air = false; one.wait = 0; one.el.classList.add('up'); grip = { x: p.x - one.x, y: p.y - one.y }; one.vx = one.vy = 0; one.ts = .9; one.s = .9; wake(); });
    one.el.addEventListener('pointermove', event => { if (!one.held) return; const p = at(event); one.x = p.x - grip.x; one.y = p.y - grip.y; draw(one); const near = nearest(one); seats.forEach((el, i) => el.classList.toggle('near', i === near)); });
    const up = () => { if (!one.held) return; one.held = false; one.el.classList.remove('up'); seats.forEach(el => el.classList.remove('near')); if (state !== 'play') return send(one, one.spot); const near = nearest(one);
      if (near === one.home) { one.in = true; one.el.classList.add('in'); send(one, places[near]); if (crowd.every(each => each.in)) { kit.stop(timer); took = Math.round(elapsed() * 10) / 10; state = 'done'; record = kit.won('c', took); } return tell(); }
      if (near !== null) { fine += WRONG; again(seats[near], 'no'); charge(kit, board, places[near].x, places[near].y - 60); return send(one, one.spot); }
      one.spot = { x: Math.max(40, Math.min(320, one.x)), y: one.y, s: one.spot.s }; send(one, one.spot); };
    one.el.addEventListener('pointerup', up); one.el.addEventListener('pointercancel', up); }
  find(board, '.go').addEventListener('click', () => state === 'look' ? kick() : fresh());
  fresh(); for (const one of crowd) { one.wait = 0; one.x = one.tx; one.y = one.ty; one.s = one.ts; draw(one); } // opens with everyone already in place
  return { fresh };
}

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const keep = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* shown, not kept */ } };
const PLAY: Record<Mode, (board: HTMLElement, kit: Kit) => Game> = { a: pairs, c: table, t: moved };
const BACK_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>';

/**
 * Draws the game into `root` and runs it. `player` is who is playing (null signed out): their animal is "You" in every
 * mode, and with Ink they choose which of their animals it is; with Ink+ it sparkles too (openspec loop-ink-tiers). Returns what stops it and clears it away.
 */
export function mountSeats(root: HTMLElement, player: SeatsPlayer): () => void {
  let alive = true, chosen = Number(read('seats-own')) || 0;
  const timers = new Set<number>(), ink = !!player?.ink, plus = !!player?.plus, picture = (each: { face: number; picture: string | null }) => each.picture ?? animal(each.face);
  const later = (run: () => void, ms: number) => { const id = window.setTimeout(() => { timers.delete(id); run(); }, ms); timers.add(id); return id; };
  const every = (run: () => void, ms: number) => { const id = window.setInterval(run, ms); timers.add(id); return id; };
  const stop = (id: number) => { clearTimeout(id); clearInterval(id); timers.delete(id); };
  /** Who plays, you first. Your animal is in the crowd once: the one it would double stands aside. */
  const faces = () => { const crowd = CROWD.map(animal); if (!player?.animals.length) return crowd; chosen = Math.max(0, Math.min(player.animals.length - 1, ink ? chosen : 0)); const own = picture(player.animals[chosen]); return [own, ...crowd.filter(each => each !== own)]; };
  const best = (mode: Mode) => parseFloat(read(`seats-best-${mode}`) ?? '') || null;
  const buttons = MODES.map(([key, name]) => `<button type="button" data-mode="${key}">${name}</button>`).join('');
  root.dataset.ink = plus ? 'plus' : ink ? 'ink' : 'free';
  root.innerHTML = `<div class="how"><span class="title" aria-hidden="true">Seats</span><span class="works">In the works</span><div class="modes">${buttons}</div>
      <p><i>1</i><span data-how="0"></span></p><p><i>2</i><span data-how="1"></span></p><p><i>3</i><span data-how="2"></span></p></div>
    <div class="stage"><span class="name" aria-hidden="true">Seats</span><button type="button" class="you"></button><div class="modes">${buttons}</div>${MODES.map(([key]) => BOARD[key]).join('')}</div>
    <div class="side"><span class="yours" hidden><small>Your best</small><b></b></span><button type="button" class="you"></button><a class="back" href="/c/doodles">${BACK_ICON}All doodles</a></div>`;
  const stage = find(root, '.stage'), yours = find(root, '.yours');
  const shown = () => { const now = best(stage.dataset.mode as Mode); yours.hidden = now === null; if (now !== null) find(yours, 'b').textContent = `${now.toFixed(1)}s`; };
  const won = (mode: Mode, took: number) => { const before = best(mode), record = before === null || took <= before; if (before === null || took < before) keep(`seats-best-${mode}`, took.toFixed(1));
    // the shelf of doodles shows one best: the fastest of the three, and which mode it was
    const all = MODES.map(([key, name]) => [best(key), name] as const).filter((each): each is readonly [number, string] => each[0] !== null).sort((a, b) => a[0] - b[0])[0]; if (all) keep('seats-best', `${all[0].toFixed(1)}s, ${all[1]}`);
    shown(); return record; };
  const kit: Kit = { reduce: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, root, faces, spark: () => plus, later, every, stop, won, alive: () => alive };
  const games = MODES.map(([key]) => { const board = find(stage, `.board.${key}`); return { key, board, game: PLAY[key](board, kit) }; });
  const rows = Array.from(root.querySelectorAll<HTMLElement>('.modes'));
  const set = (mode: Mode) => { stage.dataset.mode = mode; for (const each of games) each.board.hidden = each.key !== mode; for (const row of rows) for (const button of Array.from(row.children) as HTMLElement[]) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    root.querySelectorAll<HTMLElement>('[data-how]').forEach(el => { el.textContent = HOW[mode][Number(el.dataset.how)]; }); shown(); };
  for (const row of rows) row.addEventListener('click', event => { const mode = (event.target as HTMLElement).dataset?.mode as Mode | undefined; if (mode) set(mode); });

  // "You". With Ink the pill opens your own animals, and the one picked plays in every mode. Without, it opens what Ink gives, under the Ink mark.
  const pills = Array.from(root.querySelectorAll<HTMLButtonElement>('.you')), boxes: HTMLElement[] = [];
  const shut = () => { for (const box of boxes) box.hidden = true; for (const pill of pills) pill.setAttribute('aria-expanded', 'false'); };
  const fill = () => { for (const pill of pills) pill.innerHTML = `<img src="${faces()[0]}" alt="">You`; };
  for (const pill of pills) { const box = Object.assign(make('div', 'pick'), { hidden: true }); boxes.push(box); pill.after(box); pill.setAttribute('aria-expanded', 'false'); pill.setAttribute('aria-label', ink ? 'You: choose your animal' : 'You: play as your own animal with Ink');
    pill.addEventListener('click', event => { event.stopPropagation(); if (!box.hidden) return shut(); shut(); box.classList.toggle('ask', !ink);
      box.innerHTML = ink ? '<span class="tag">Your animal</span>' + player!.animals.map((each, n) => `<button type="button" data-n="${n}" aria-pressed="${n === chosen}" aria-label="Your animal ${n + 1}"><img src="${picture(each)}" alt=""></button>`).join('')
        : `<span class="tag mark" role="img" aria-label="Ink">${inkMark()}</span><p>Play as your own animal, in every mode.</p><button type="button" data-join>Get Ink · $2.99</button>`;
      box.hidden = false; pill.setAttribute('aria-expanded', 'true'); });
    box.addEventListener('click', event => { event.stopPropagation();
      // Signing up for Ink from here (openspec loop-ink-tiers): the same route as every ask in the app, then its thanks.
      const join = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-join]');
      if (join) { join.disabled = true; void signUp().then(said => { if (said) { find(box, 'p').textContent = said; join.remove(); } else { find(box, 'p').textContent = 'That did not go through. Try again.'; join.disabled = false; } }); return; }
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-n]'); if (!button) return;
      chosen = Number(button.dataset.n); keep('seats-own', String(chosen)); fill(); for (const each of games) each.game.fresh(); shut(); }); }
  document.addEventListener('click', shut);
  fill(); set('a');
  return () => { alive = false; for (const id of timers) { clearTimeout(id); clearInterval(id); } timers.clear(); document.removeEventListener('click', shut); root.replaceChildren(); };
}
