import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MAX, mountSeats, WRONG, type SeatsPlayer } from './seats-game';

let root: HTMLElement, close: () => void;
const open = (player: SeatsPlayer = null) => { root = document.createElement('div'); root.className = 'sg'; document.body.append(root); close = mountSeats(root, player); };
const board = (mode = 'a') => root.querySelector<HTMLElement>(`.board.${mode}`)!;
const mode = (key: string) => root.querySelector<HTMLElement>(`.how [data-mode=${key}]`)!.click();
const clock = (key: string) => Number(board(key).querySelector('[data-clock]')!.textContent);
const srcs = (key: string, what: string) => [...board(key).querySelectorAll<HTMLImageElement>(`${what} img`)].map(img => img.getAttribute('src'));
const press = (key: string) => board(key).querySelector<HTMLElement>('.go')!.click();

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] }); localStorage.clear(); });
afterEach(() => { close?.(); root?.remove(); vi.useRealTimers(); });

it('opens on Chart, with the three modes in the founder\'s order', () => {
  open();
  expect([...root.querySelectorAll('.how [data-mode]')].map(button => button.textContent)).toEqual(['Chart', 'Table', 'Who moved?']);
  expect(board('a').hidden).toBe(false); expect(board('c').hidden).toBe(true); expect(board('t').hidden).toBe(true);
  mode('t');
  expect(board('t').hidden).toBe(false); expect(board('a').hidden).toBe(true);
  expect(root.querySelector('[data-how="2"]')!.textContent).toBe('Tap the ones that moved. A wrong tap costs 2 seconds.');
});

it('Chart: six animals twice; a miss costs 2 seconds and turns back; every pair found ends it and keeps the best', () => {
  open();
  const faces = srcs('a', '.tile'), tiles = [...board('a').querySelectorAll<HTMLButtonElement>('.tile')];
  expect(new Set(faces).size).toBe(6);
  press('a');
  expect(board('a').classList.contains('play')).toBe(true); expect(tiles.every(tile => tile.classList.contains('down'))).toBe(true);
  const other = faces.findIndex(face => face !== faces[0]);
  tiles[0].click(); tiles[other].click();
  expect(clock('a')).toBeCloseTo(WRONG, 1);
  vi.advanceTimersByTime(800);
  expect(tiles[0].classList.contains('down')).toBe(true); expect(tiles[other].classList.contains('down')).toBe(true);
  for (const face of new Set(faces)) for (const [at, each] of faces.entries()) if (each === face) tiles[at].click();
  expect(board('a').classList.contains('done')).toBe(true);
  expect(localStorage.getItem('seats-best-a')).toBe(clock('a').toFixed(1));
  expect(localStorage.getItem('seats-best')).toBe(`${clock('a').toFixed(1)}s, Chart`);
  expect(root.querySelector('.yours b')!.textContent).toBe(`${clock('a').toFixed(1)}s`);
});

it('the clock stops at a minute and the round is lost, in every mode', () => {
  open();
  for (const key of ['a', 'c', 't']) { mode(key); press(key); }
  vi.advanceTimersByTime((MAX + 2) * 1000);
  for (const key of ['a', 'c', 't']) { expect(board(key).classList.contains('lost')).toBe(true); expect(board(key).querySelector('[data-clock]')!.textContent).toBe('60.0'); expect(board(key).querySelector('.go')!.textContent).toBe('Again'); }
  expect(localStorage.getItem('seats-best')).toBeNull();
});

/** One round of Who moved?: waits for the lights, returns the spots whose animal changed. */
const lightsOn = (before: (string | null)[]) => { vi.advanceTimersByTime(900); const now = srcs('t', '.spot'); return { now, moved: now.map((face, at) => face !== before[at] ? at : -1).filter(at => at >= 0) }; };

it('Who moved?: five rounds, a count of what is left, a look between rounds that can be skipped, and the clock waits for it', () => {
  open(); mode('t');
  const spots = [...board('t').querySelectorAll<HTMLButtonElement>('.spot')], plate = board('t').querySelector('.admit')!, counts: number[] = [];
  let before = srcs('t', '.spot');
  press('t');
  expect(plate.textContent).toBe('Lights out');
  for (let round = 0; round < 5; round++) {
    const { now, moved } = lightsOn(before); before = now; counts.push(moved.length);
    expect(plate.textContent).toBe(`${moved.length} to find`);
    if (round === 0) { const still = now.findIndex((_, at) => !moved.includes(at)), was = clock('t'); spots[still].click(); expect(clock('t')).toBeCloseTo(was + WRONG, 1); }
    for (const at of moved) spots[at].click();
    if (round === 4) break;
    vi.advanceTimersByTime(500);
    expect(plate.textContent).toMatch(/^Look: \d+$/);
    const held = clock('t'); vi.advanceTimersByTime(2000); expect(clock('t')).toBe(held);
    press('t'); // "Lights out": the look is skipped
  }
  expect(counts).toEqual([2, 2, 2, 4, 4]);
  expect(board('t').classList.contains('done')).toBe(true);
  expect(localStorage.getItem('seats-best-t')).not.toBeNull();
});

it('Who moved?: after ten seconds with nothing found, one that moved gives itself away', () => {
  open(); mode('t');
  const before = srcs('t', '.spot'); press('t');
  const { moved } = lightsOn(before);
  expect(board('t').querySelector('.spot.hint')).toBeNull();
  vi.advanceTimersByTime(10200);
  const hinted = [...board('t').querySelectorAll('.spot')].findIndex(spot => spot.classList.contains('hint'));
  expect(moved).toContain(hinted);
});

it('signed out, or without Ink: "You" opens what Ink gives, with a sign-up, and no animal is marked', () => {
  open({ ink: false, animals: [{ face: 12, picture: null }] });
  expect(root.dataset.ink).toBe('free');
  expect(srcs('a', '.tile').filter(src => src === '/animals/12.webp')).toHaveLength(2);
  expect(root.querySelector('.spark:not([hidden])')).toBeNull();
  root.querySelector<HTMLElement>('.side .you')!.click();
  const box = root.querySelector('.side .pick')!;
  expect(box.textContent).toContain('Play as your own animal');
  // The Ink mark in place of the plan's name, and the button signs up (openspec loop-ink-tiers).
  expect(box.querySelector('[role=img]')!.getAttribute('aria-label')).toBe('Ink');
  expect(box.querySelector('[data-join]')!.textContent).toBe('Get Ink · $2.99');
});

it('signs up for Ink from the box, recording where, and thanks them', async () => {
  const posted = vi.fn(async (_: string, init: RequestInit) => new Response(JSON.stringify({ ok: true, said: 'Thanks for your interest. This isn’t ready yet, so we’ve upgraded you to Ink for now.', sent: init.body })));
  vi.stubGlobal('fetch', posted);
  open({ ink: false, animals: [{ face: 12, picture: null }] });
  root.querySelector<HTMLElement>('.side .you')!.click();
  root.querySelector<HTMLElement>('.side .pick [data-join]')!.click();
  await vi.waitFor(() => expect(root.querySelector('.side .pick p')!.textContent).toBe('Thanks for your interest. This isn’t ready yet, so we’ve upgraded you to Ink for now.'));
  expect(JSON.parse(String(posted.mock.calls[0][1].body))).toMatchObject({ plan: 'ink', place: 'seats: Get Ink' });
  expect(root.querySelector('.side .pick [data-join]')).toBeNull();
  vi.unstubAllGlobals();
});

it('with Ink+ the page says so, for the sparkle', () => {
  open({ ink: true, plus: true, animals: [{ face: 12, picture: null }] });
  expect(root.dataset.ink).toBe('plus');
});

it('with Ink: "You" lists your animals, and the one picked plays in every mode and is kept', () => {
  open({ ink: true, animals: [{ face: 12, picture: null }, { face: 0, picture: '/pets/mine.png' }, { face: 10, picture: null }] });
  expect(root.dataset.ink).toBe('ink');
  root.querySelector<HTMLElement>('.side .you')!.click();
  const choices = [...root.querySelectorAll<HTMLElement>('.side .pick [data-n]')];
  expect(choices).toHaveLength(3);
  choices[1].click();
  expect(root.querySelector('.side .pick')!.hasAttribute('hidden')).toBe(true);
  expect(root.querySelector('.side .you img')!.getAttribute('src')).toBe('/pets/mine.png');
  expect(srcs('a', '.tile').filter(src => src === '/pets/mine.png')).toHaveLength(2);
  expect(srcs('t', '.spot').filter(src => src === '/pets/mine.png')).toHaveLength(1);
  expect([...board('c').querySelectorAll('.pet')].filter(pet => pet.getAttribute('src') === '/pets/mine.png')).toHaveLength(1);
  expect(localStorage.getItem('seats-own')).toBe('1');
  // an animal the crowd already has is in it once
  root.querySelector<HTMLElement>('.side .you')!.click(); root.querySelectorAll<HTMLElement>('.side .pick [data-n]')[2].click();
  expect(srcs('t', '.spot').filter(src => src === '/animals/10.webp')).toHaveLength(1);
});

it('leaves nothing behind when the page goes', () => {
  open(); mode('t'); press('t'); press('a'); close();
  expect(root.childElementCount).toBe(0);
  // the clocks and the lights were stopped: time going by touches nothing
  expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  expect(root.childElementCount).toBe(0);
});
