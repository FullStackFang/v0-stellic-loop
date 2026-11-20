import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { DOODLES, doodlesFor } from '@/lib/campus/doodles';
import { DoodleShelf } from './doodles';

afterEach(() => { cleanup(); localStorage.clear(); });
const names = () => screen.getAllByRole('heading', { level: 2 }).map(each => each.textContent);

it('shows a visitor only what is out', () => {
  expect(doodlesFor(false).map(each => each.slug)).toEqual(['conga']);
  render(<DoodleShelf doodles={doodlesFor(false)} />);
  expect(names()).toEqual(['Conga']);
  expect(screen.getByRole('link', { name: 'Play Conga' })).toHaveAttribute('href', '/conga');
  expect(screen.queryByText(/Staged/)).toBeNull();
});

it('shows the admin the staged ones too, marked and after the rest', () => {
  expect(doodlesFor(true)).toEqual(DOODLES);
  render(<DoodleShelf doodles={doodlesFor(true)} />);
  expect(names()).toEqual(['Conga', 'Seats']);
  const seats = screen.getByRole('heading', { name: 'Seats' }).closest('li')!;
  expect(within(seats).getByText('Staged: only you see this')).toBeInTheDocument();
  expect(within(seats).getByRole('link', { name: 'Try Seats' })).toHaveAttribute('href', '/demo/mockups-footer-seats.html');
  expect(within(seats).queryByRole('link', { name: /Play/ })).toBeNull();
});

it('says the best the browser has kept, and says nothing before a first game', () => {
  const { unmount } = render(<DoodleShelf doodles={doodlesFor(false)} />);
  expect(screen.queryByText(/Your best/)).toBeNull();
  unmount();
  localStorage.setItem('conga-best', '23');
  render(<DoodleShelf doodles={doodlesFor(false)} />);
  expect(screen.getByText('Your best: 23')).toBeInTheDocument();
});
