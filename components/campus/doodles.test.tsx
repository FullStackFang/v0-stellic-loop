import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { DOODLES, doodlesFor, term, type Doodle } from '@/lib/campus/doodles';
import { DoodleShelf } from './doodles';

afterEach(() => { cleanup(); localStorage.clear(); });
const names = () => screen.getAllByRole('heading', { level: 2 }).map(each => each.textContent);
const ticket = (name: string) => within(screen.getByRole('heading', { name }).closest('li')!);
const staged: Doodle = { slug: 'seats', name: 'Seats', line: 'Not out yet.', href: '/somewhere', live: false };
const cornell = { slug: 'cornell', name: 'Cornell' }, columbia = { slug: 'columbia', name: 'Columbia' };

it('shows everyone what is out, each with a way to enrol in it', () => {
  expect(doodlesFor(false)).toEqual(DOODLES.filter(each => each.live));
  render(<DoodleShelf doodles={doodlesFor(false)} campus={columbia} />);
  expect(names()).toEqual(['Conga', 'Seats']);
  expect(screen.getByRole('link', { name: 'Enrol in Conga' })).toHaveAttribute('href', '/conga');
  expect(screen.getByRole('link', { name: 'Enrol in Seats' })).toHaveAttribute('href', '/c/doodles/seats');
  expect(screen.queryByText(/Staged/)).toBeNull();
});

it('makes Conga a course of a campus it has a map of, and sends it to that map', () => {
  render(<DoodleShelf doodles={doodlesFor(false)} campus={cornell} />);
  expect(ticket('Conga').getByText('CAMPUS 1010')).toBeInTheDocument();
  expect(ticket('Conga').getByText('Walk your animal round Cornell and gather the longest line of classmates.')).toBeInTheDocument();
  expect(ticket('Conga').getByText('The quickest way round Beebe Lake')).toBeInTheDocument();
  expect(ticket('Conga').getByRole('link', { name: 'Enrol in Conga' })).toHaveAttribute('href', '/conga?map=cornell');
});

it('names no place for a campus Conga has no map of', () => {
  render(<DoodleShelf doodles={doodlesFor(false)} campus={columbia} />);
  expect(ticket('Conga').getByText('Walk your animal round campus and gather the longest line.')).toBeInTheDocument();
  expect(ticket('Conga').queryByText(/Columbia/)).toBeNull();
  expect(ticket('Seats').getByText('ANIMALS 1020')).toBeInTheDocument();
});

it('says which one is still in the works', () => {
  render(<DoodleShelf doodles={doodlesFor(false)} campus={cornell} />);
  expect(ticket('Seats').getByText('In the works')).toBeInTheDocument();
  expect(ticket('Conga').queryByText('In the works')).toBeNull();
  expect(ticket('Conga').getByText('Out now')).toBeInTheDocument();
});

it('keeps a staged one for the admin, marked, with Try in place of Enrol', () => {
  expect(doodlesFor(true)).toEqual(DOODLES);
  render(<DoodleShelf doodles={[staged]} campus={cornell} />);
  expect(ticket('Seats').getByText('Staged: only you see this')).toBeInTheDocument();
  expect(ticket('Seats').getByRole('link', { name: 'Try Seats' })).toHaveAttribute('href', '/somewhere');
  expect(ticket('Seats').queryByRole('link', { name: /Enrol/ })).toBeNull();
});

it('says the best the browser has kept, with a Passed stamp, and nothing before a first game', () => {
  const { unmount } = render(<DoodleShelf doodles={doodlesFor(false)} campus={cornell} />);
  expect(screen.queryByText('Your best')).toBeNull();
  expect(screen.queryByText('Passed')).toBeNull();
  unmount();
  localStorage.setItem('conga-best', '23');
  localStorage.setItem('seats-best', '12.4s, Chart');
  render(<DoodleShelf doodles={doodlesFor(false)} campus={cornell} />);
  expect(ticket('Conga').getByText('Your best')).toBeInTheDocument();
  expect(ticket('Conga').getAllByText('23')).toHaveLength(2);
  expect(ticket('Seats').getAllByText('12.4s')).toHaveLength(2);
  expect(ticket('Conga').getByText('Passed')).toBeInTheDocument();
});

it('names the term as a catalogue does', () => {
  expect(term(new Date(2026, 10, 21))).toBe('Fall 2026');
  expect(term(new Date(2027, 1, 3))).toBe('Spring 2027');
  expect(term(new Date(2027, 6, 1))).toBe('Summer 2027');
});
