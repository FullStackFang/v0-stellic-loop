import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { DOODLES, doodlesFor, type Doodle } from '@/lib/campus/doodles';
import { DoodleShelf } from './doodles';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const names = () => screen.getAllByRole('heading', { level: 2 }).map(each => each.textContent);
const tile = (name: string) => within(screen.getByRole('heading', { name }).closest('li')!);
const staged: Doodle = { slug: 'seats', name: 'Seats', line: 'Not out yet.', href: '/somewhere', live: false, shot: [696, 1016] };
const cornell = { slug: 'cornell', name: 'Cornell' }, columbia = { slug: 'columbia', name: 'Columbia' };

it('shows everyone what is out, each with its recording and a way to play it, and nothing else', () => {
  expect(doodlesFor(false)).toEqual(DOODLES.filter(each => each.live));
  render(<DoodleShelf doodles={doodlesFor(false)} campus={columbia} />);
  expect(names()).toEqual(['Conga', 'Seats']);
  expect(screen.getByRole('link', { name: 'Play Conga' })).toHaveAttribute('href', '/conga');
  expect(screen.getByRole('link', { name: 'Play Seats' })).toHaveAttribute('href', '/c/doodles/seats');
  expect(screen.queryByText(/Staged/)).toBeNull();
  expect(screen.queryByText(/learn|Credits|Enrol|1010|1020/)).toBeNull();
  const clip = screen.getByLabelText(/^Conga being played/);
  expect(clip).toHaveAttribute('src', '/doodles/conga.v1.mp4');
  expect(clip).toHaveAttribute('poster', '/doodles/conga.v1.webp');
});

it('fetches no recording until its tile is on screen', () => {
  render(<DoodleShelf doodles={doodlesFor(false)} campus={columbia} />);
  for (const clip of document.querySelectorAll('video')) { expect(clip).toHaveAttribute('preload', 'none'); expect(clip).not.toHaveAttribute('autoplay'); }
});

it('plays a recording while its tile is on screen and stops it when it leaves', () => {
  let tell: (seen: { isIntersecting: boolean }[]) => void = () => {};
  vi.stubGlobal('IntersectionObserver', class { constructor(run: typeof tell) { tell = run; } observe() {} disconnect() {} });
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(), pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockReturnValue();
  render(<DoodleShelf doodles={[DOODLES[0]]} campus={columbia} />);
  expect(play).not.toHaveBeenCalled();
  tell([{ isIntersecting: true }]);
  expect(play).toHaveBeenCalledTimes(1);
  tell([{ isIntersecting: false }]);
  expect(pause).toHaveBeenCalledTimes(1);
});

it('keeps the still picture for someone who asked for less motion', () => {
  const watched = vi.fn();
  vi.stubGlobal('IntersectionObserver', class { observe = watched; disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  render(<DoodleShelf doodles={[DOODLES[0]]} campus={columbia} />);
  expect(watched).not.toHaveBeenCalled();
});

it('sends Conga to the map of a campus it has one of', () => {
  render(<DoodleShelf doodles={doodlesFor(false)} campus={cornell} />);
  expect(tile('Conga').getByRole('link', { name: 'Play Conga' })).toHaveAttribute('href', '/conga?map=cornell');
});

it('says which one is still in the works', () => {
  render(<DoodleShelf doodles={doodlesFor(false)} campus={cornell} />);
  expect(tile('Seats').getByText('In the works')).toBeInTheDocument();
  expect(tile('Conga').queryByText('In the works')).toBeNull();
});

it('keeps a staged one for the admin, marked, with Try in place of Play', () => {
  expect(doodlesFor(true)).toEqual(DOODLES);
  render(<DoodleShelf doodles={[staged]} campus={cornell} />);
  expect(tile('Seats').getByText('Staged: only you see this')).toBeInTheDocument();
  expect(tile('Seats').getByRole('link', { name: 'Try Seats' })).toHaveAttribute('href', '/somewhere');
  expect(tile('Seats').queryByRole('link', { name: /Play/ })).toBeNull();
});
