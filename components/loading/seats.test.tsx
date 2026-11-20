import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { animal } from '@/lib/campus/animals';
import { inkBlot } from '@/lib/campus/ink-blot';
import { ARRIVE_MS, SEEN_MS } from './ending';
import { LINE, SeatsMe, SeatsSmall, SeatsTicket } from './seats';
import { SeatsEnding } from './seats-ending';

// "Saving seats" (openspec loop-loading-seats): the ticket, the small one, and the splat that ends a page-sized wait.
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const srcs = (box: HTMLElement) => [...box.querySelectorAll('img')].map(img => img.getAttribute('src'));
const BEAR = animal(37);

describe('the ticket', () => {
  it('says the one line, once, to a screen reader, and hides its faces', () => {
    const { container } = render(<SeatsTicket />);
    expect(LINE).toBe('Looping you in…');
    expect(screen.getByRole('status')).toHaveTextContent(LINE);
    expect(screen.getAllByText(LINE)).toHaveLength(1);
    for (const img of container.querySelectorAll('img')) expect(img).toHaveAttribute('alt', '');
  });
  it('has four seats, the last one a free animal when the viewer is not known', () => {
    const { container } = render(<SeatsTicket />);
    expect(srcs(container)).toEqual([animal(4), animal(7), animal(16), animal(11)]);
  });
  it('seats the viewer last when their face is given, or known from above', () => {
    expect(srcs(render(<SeatsTicket face={BEAR} />).container).at(-1)).toBe(BEAR);
    expect(srcs(render(<SeatsMe me={{ face: BEAR }}><SeatsTicket /></SeatsMe>).container).at(-1)).toBe(BEAR);
  });
  it('draws the same thing twice for the same viewer', () => {
    expect(renderToStaticMarkup(<SeatsTicket face={BEAR} />)).toBe(renderToStaticMarkup(<SeatsTicket face={BEAR} />));
  });
  it('for a long wait rings the last seat and leaves it empty until its picture comes', () => {
    const { container, rerender } = render(<SeatsTicket slow face={BEAR} />);
    expect(container.querySelector('.seats-slow .seats-mine')).toBeEmptyDOMElement();
    expect(srcs(container)).toHaveLength(3);
    rerender(<SeatsTicket slow face={BEAR} filled="/animals/custom/new" />);
    expect(container.querySelector('.seats-mine img')).toHaveAttribute('src', '/animals/custom/new');
  });
});

describe('the small one', () => {
  it('is one face on a blot and says nothing to a screen reader', () => {
    const { container } = render(<SeatsSmall face={BEAR} />);
    expect(srcs(container)).toEqual([BEAR]);
    expect(container.querySelector('.seats-sm')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(LINE)).toBeNull();
  });
  it('on the free plan, and for a viewer who is not known, sits on one plain shape with no drops', () => {
    const { container } = render(<SeatsSmall />);
    expect(srcs(container)).toEqual([animal(11)]);
    expect(container.querySelectorAll('svg.seats-free path')).toHaveLength(1);
    expect(container.querySelector('.seats-school, .seats-seep, circle')).toBeNull();
  });
  it('with Ink sits on the member\'s own blot, in two inks', () => {
    const { container } = render(<SeatsSmall face={BEAR} plan="ink" seed="Maya" />), blot = inkBlot('Maya');
    expect(container.querySelector('path.seats-school')).toHaveAttribute('d', blot.school);
    expect(container.querySelector('path.seats-dark')).toHaveAttribute('d', blot.dark);
    expect(container.querySelectorAll('circle')).toHaveLength(blot.schoolDrops.length + blot.darkDrops.length);
    expect(container.querySelector('.seats-free')).toBeNull();
  });
  it('takes the plan and the blot from above, like the face', () => {
    const { container } = render(<SeatsMe me={{ face: BEAR, plan: 'ink', seed: 'Josh' }}><SeatsSmall /></SeatsMe>);
    expect(container.querySelector('path.seats-dark')).toHaveAttribute('d', inkBlot('Josh').dark);
  });
  it('carries the line, announced once, when it stands for a part of a page', () => {
    render(<SeatsSmall line />);
    expect(screen.getByRole('status')).toHaveTextContent(LINE);
  });
});

describe('the splat that ends a page-sized wait', () => {
  const box = { left: 40, top: 200, width: 250, height: 80, right: 290, bottom: 280, x: 40, y: 200, toJSON() {} };
  const measured = () => vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(box as DOMRect);
  /** A page-sized ticket shown for `ms`, then replaced by its page. */
  function waited(ms: number, me: Parameters<typeof SeatsTicket>[0] = {}) {
    vi.useFakeTimers(); measured();
    const view = render(<><SeatsEnding /><div id="slot"><SeatsTicket page {...me} /></div></>);
    act(() => { vi.advanceTimersByTime(ms); });
    act(() => { view.rerender(<><SeatsEnding /><div id="slot"><p>The page</p></div></>); });
    return view.container;
  }
  it('lands where the ticket stood, takes no presses and is hidden from screen readers', () => {
    const end = waited(ARRIVE_MS + SEEN_MS + 50).querySelector<HTMLElement>('.seats-end')!;
    expect(end).toHaveAttribute('aria-hidden', 'true');
    expect(end.style.left).toBe('40px'); expect(end.style.top).toBe('200px'); expect(end.style.width).toBe('250px');
    expect(end.querySelector('.seats-splat')).not.toBeNull();
    expect(readFileSync('components/loading/seats.css', 'utf8')).toMatch(/\.seats-end \{[^}]*pointer-events: none/);
  });
  it('removes itself when it has played', () => {
    const container = waited(ARRIVE_MS + SEEN_MS + 50);
    act(() => { vi.advanceTimersByTime(1100); });
    expect(container.querySelector('.seats-end')).toBeNull();
  });
  it('does not play for a ticket that was barely seen', () => {
    expect(waited(ARRIVE_MS + 200).querySelector('.seats-end')).toBeNull();
  });
  it('does not play under reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: /reduce/.test(query), addEventListener() {}, removeEventListener() {} }));
    expect(waited(ARRIVE_MS + SEEN_MS + 50).querySelector('.seats-end')).toBeNull();
  });
  it('does not play for a ticket that stands for a part of a page', () => {
    vi.useFakeTimers(); measured();
    const view = render(<><SeatsEnding /><SeatsTicket slow /></>);
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { view.rerender(<><SeatsEnding /><p>Done</p></>); });
    expect(view.container.querySelector('.seats-end')).toBeNull();
  });
  it('on the free plan is one dark shape with no school colour', () => {
    const splat = waited(700).querySelector('.seats-splat')!;
    expect(splat).toHaveClass('seats-free');
    expect(splat.querySelector('.seats-school, .seats-seep, .seats-third')).toBeNull();
    expect(splat.querySelectorAll('.seats-body path')).toHaveLength(1);
  });
  it('with Ink is the member\'s own blot in two inks, with no spark', () => {
    const splat = waited(700, { plan: 'ink', seed: 'Maya', face: BEAR }).querySelector('.seats-splat')!;
    expect(splat.querySelector('.seats-body .seats-dark')).toHaveAttribute('d', inkBlot('Maya').dark);
    expect(splat.querySelector('.seats-body .seats-school')).toHaveAttribute('d', inkBlot('Maya').school);
    expect(splat.querySelector('.seats-third')).toBeNull();
  });
  it('with Ink+ adds a spark in a third ink, and throws sparks', () => {
    const splat = waited(700, { plan: 'plus', seed: 'Josh' }).querySelector('.seats-splat')!;
    expect(splat.querySelector('.seats-body path.seats-third')).not.toBeNull();
    expect(splat.querySelectorAll('g.seats-third path.seats-drop').length).toBeGreaterThan(4);
    expect(splat.querySelector('g.seats-third circle')).toBeNull();
  });
  it('shows the ticket full, with the viewer in the last seat', () => {
    expect(srcs(waited(700, { face: BEAR }).querySelector('.seats-end')!)).toEqual([animal(4), animal(7), animal(16), BEAR]);
  });
});

describe('the stylesheet', () => {
  const css = readFileSync('components/loading/seats.css', 'utf8');
  it('holds the loader back 150 ms so a fast answer never flashes it', () => {
    expect(ARRIVE_MS).toBe(150);
    for (const rule of ['.seats-tk', '.seats-sm', '.seats-part', '.seats-screen']) expect(css).toMatch(new RegExp(`\\${rule} \\{[^}]*animation: seats-arrive \\.2s \\.15s both`));
  });
  it('stands still under reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.seats-tk, \.seats-tk \*, \.seats-sm, \.seats-sm \*[^{]*\{ animation: none !important; \}/);
  });
  it('reads each campus colour with a fallback, so it is never colourless off the campus pages', () => {
    for (const token of ['--cs-field', '--cs-ink', '--cs-action', '--cs-paper', '--cs-third']) expect(css).toMatch(new RegExp(`var\\(${token}, oklch`));
    expect(css.replace(/var\(--cs-[a-z]+, /g, '')).not.toMatch(/var\(--cs-/);
  });
});
