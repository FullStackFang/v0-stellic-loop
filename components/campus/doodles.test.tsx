import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { DOODLES, doodlesFor, type Doodle } from '@/lib/campus/doodles';
import { DoodleShelf } from './doodles';

afterEach(() => { cleanup(); localStorage.clear(); });
const names = () => screen.getAllByRole('heading', { level: 2 }).map(each => each.textContent);
const ticket = (name: string) => within(screen.getByRole('heading', { name }).closest('li')!);
const staged: Doodle = { slug: 'seats', name: 'Seats', line: 'Not out yet.', href: '/somewhere', live: false };

it('shows everyone what is out, each with a way to play it', () => {
  expect(doodlesFor(false)).toEqual(DOODLES.filter(each => each.live));
  render(<DoodleShelf doodles={doodlesFor(false)} />);
  expect(names()).toEqual(['Conga', 'Seats']);
  expect(screen.getByRole('link', { name: 'Play Conga' })).toHaveAttribute('href', '/conga');
  expect(screen.getByRole('link', { name: 'Play Seats' })).toHaveAttribute('href', '/c/doodles/seats');
  expect(screen.queryByText(/Staged/)).toBeNull();
});

it('says which one is still in the works', () => {
  render(<DoodleShelf doodles={doodlesFor(false)} />);
  expect(ticket('Seats').getByText('In the works')).toBeInTheDocument();
  expect(ticket('Conga').queryByText('In the works')).toBeNull();
  expect(ticket('Conga').getByText('Out now')).toBeInTheDocument();
});

it('keeps a staged one for the admin, marked, with Try in place of Play', () => {
  expect(doodlesFor(true)).toEqual(DOODLES);
  render(<DoodleShelf doodles={[staged]} />);
  expect(ticket('Seats').getByText('Staged: only you see this')).toBeInTheDocument();
  expect(ticket('Seats').getByRole('link', { name: 'Try Seats' })).toHaveAttribute('href', '/somewhere');
  expect(ticket('Seats').queryByRole('link', { name: /Play/ })).toBeNull();
});

it('says the best the browser has kept, and says nothing before a first game', () => {
  const { unmount } = render(<DoodleShelf doodles={doodlesFor(false)} />);
  expect(screen.queryByText(/Your best/)).toBeNull();
  unmount();
  localStorage.setItem('conga-best', '23');
  render(<DoodleShelf doodles={doodlesFor(false)} />);
  expect(screen.getByText('Your best: 23')).toBeInTheDocument();
});
