import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { slotsOf } from '@/lib/when/slots';
import { Grid } from './[id]/grid';
import { Pick } from './[id]/pick';
import { CreateForm } from './new/create-form';

vi.mock('./actions', () => ({ createPollAction: vi.fn(async () => null), sendPollAction: vi.fn(async () => null), openedAction: vi.fn() }));
afterEach(() => { cleanup(); sessionStorage.clear(); });

const TUE7 = '2026-12-02T00:00:00.000Z';
const day = (name: string) => screen.getByRole('button', { name });
const field = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value;

it('picks the days and the last day to answer on one calendar, with weekends left out until asked for', () => {
  render(<CreateForm signIn={null} today="2026-11-22" head={null}
    first={{ title: '', startDate: '2026-11-25', endDate: '2026-11-27', hourStart: '17', hourEnd: '22', expectedSize: '7', by: '2026-11-24', threshold: 'two_thirds', weekends: '0' }} />);
  expect(day('Sat 28 Nov')).toBeDisabled();
  expect(day('Sat 21 Nov')).toBeDisabled();
  fireEvent.click(day('Mon 30 Nov'));
  expect(screen.getByText('Now tap the last day')).toBeInTheDocument();
  fireEvent.click(day('Fri 4 Dec'));
  expect([field('startDate'), field('endDate'), field('weekends')]).toEqual(['2026-11-30', '2026-12-04', '0']);
  expect(screen.getByRole('button', { name: /The days/ })).toHaveTextContent('30 Nov to 4 Dec');
  // more than two weeks on from the first day starts over
  fireEvent.click(day('Mon 30 Nov')); fireEvent.click(day('Wed 16 Dec'));
  expect([field('startDate'), field('endDate')]).toEqual(['2026-12-16', '2026-12-16']);
  fireEvent.click(day('Mon 30 Nov')); fireEvent.click(day('Fri 4 Dec'));
  fireEvent.click(screen.getByRole('radio', { name: 'Include them' }));
  expect(day('Sat 28 Nov')).toBeEnabled();
  expect(field('weekends')).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: /Answer by/ }));
  expect(day('Tue 1 Dec')).toBeDisabled();
  fireEvent.click(day('Thu 26 Nov'));
  expect(screen.getByRole('button', { name: /Answer by/ })).toHaveTextContent('Thu 26 Nov');
});

it('moves the last day to answer ahead of the days when they are moved before it', () => {
  render(<CreateForm signIn={null} today="2026-11-22" head={null}
    first={{ title: '', startDate: '2026-11-30', endDate: '2026-12-04', hourStart: '17', hourEnd: '22', expectedSize: '7', by: '2026-11-27', threshold: 'two_thirds', weekends: '1' }} />);
  fireEvent.click(day('Tue 24 Nov'));
  expect(screen.getByRole('button', { name: /Answer by/ })).toHaveTextContent('Mon 23 Nov');
});

it('shows a long poll five days at a time, the first days first, and says the best of each set', () => {
  const slots = slotsOf({ startDate: '2026-11-25', endDate: '2026-12-07', hourStart: 17, hourEnd: 22, timezone: 'America/New_York' });
  render(<Grid slots={slots} others={{ [TUE7]: 2 }} onSave={async () => null} after="Saved." size={7}
    best={[{ at: TUE7, dow: 'Tue', date: '1 Dec', time: '7 pm', line: '2 of 7 can make it', people: [] }]} />);
  expect(day('Wed 25, 5 pm')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Mon 30, 5 pm' })).toBeNull();
  const sets = screen.getAllByRole('button', { name: /Best is/ });
  expect(sets.map(set => set.textContent)).toEqual(['Best is 0 of 725 to 29 Nov', 'Best is 2 of 730 Nov to 4 Dec', 'Best is 0 of 75 to 7 Dec']);
  fireEvent.click(sets[2]);
  expect(day('Mon 7, 5 pm')).toBeInTheDocument();
  fireEvent.click(day('Show Tue 1 Dec, 7 pm'));
  expect(day('Tue 1, 7 pm')).toHaveTextContent('2');
  expect(sets[1]).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(day('Tue 1, 7 pm'));
  expect(sets[1]).toHaveTextContent('Best is 3 of 7');
});

it('shows the grid to someone who cannot paint, with the action in place of Save', () => {
  const slots = slotsOf({ startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: 'America/New_York' });
  render(<Grid slots={slots} others={{ [TUE7]: 2 }} won={TUE7} action={<a href="/in">Sign in to add your times</a>} />);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByLabelText('Tue 1, 7 pm: 2 free')).toHaveClass('won');
  expect(screen.getByRole('link', { name: 'Sign in to add your times' })).toBeInTheDocument();
});

it('lets the organizer start a quarter past and say how long it runs', () => {
  render(<Pick pollId="abcdefghijkl" goesTo={3} as="Maya" choices={[
    { at: TUE7, dow: 'Tue', date: '1 Dec', time: '7 pm', hour: 19, line: '3 of 7', people: [] },
    { at: '2026-12-02T01:00:00.000Z', dow: 'Tue', date: '1 Dec', time: '8 pm', hour: 20, line: '2 of 7', people: [] }]} />);
  expect(screen.getByRole('heading', { name: 'The meeting Tue 1 Dec, 7 to 8 pm' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: '7:15' }));
  fireEvent.click(screen.getByRole('radio', { name: '45 min' }));
  expect(screen.getByRole('heading', { name: 'The meeting Tue 1 Dec, 7:15 to 8 pm' })).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('radio')[1]);
  expect(screen.getByRole('heading', { name: 'The meeting Tue 1 Dec, 8:15 to 9 pm' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '8:15' })).toBeChecked();
});
