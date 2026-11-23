import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { slotsOf } from '@/lib/when/slots';
import { Grid, WHO } from './grid';

vi.mock('../actions', () => ({}));
afterEach(() => { cleanup(); sessionStorage.clear(); });

const slots = slotsOf({ startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: 'America/New_York' });
const TUE7 = '2026-12-02T00:00:00.000Z', TUE8 = '2026-12-02T01:00:00.000Z';
const cell = (name: string) => screen.getByRole('button', { name });
function show(over: Partial<Parameters<typeof Grid>[0]> = {}) {
  const onSave = vi.fn<(slots: string[]) => Promise<null>>(async () => null);
  render(<Grid slots={slots} free={{ [TUE7]: [{ personId: 'a', name: 'Josh', face: '/animals/01.webp' }, { personId: 'b', name: 'Priya', face: '/animals/02.webp' }] }} size={7} mine={[]} onSave={onSave} after="Saved." {...over} />);
  return onSave;
}

it('names every time, and a click paints it and counts the person in', () => {
  show();
  const tue7 = cell('Tue 1, 7 pm');
  expect(screen.getAllByRole('button')).toHaveLength(26);
  expect(tue7).toHaveAttribute('aria-pressed', 'false');
  expect(tue7).toHaveTextContent('2');
  expect(tue7).toHaveClass('wn-cell');
  fireEvent.click(tue7);
  expect(tue7).toHaveAttribute('aria-pressed', 'true');
  expect(tue7).toHaveTextContent('3');
  fireEvent.click(tue7);
  expect(tue7).toHaveAttribute('aria-pressed', 'false');
});

it('paints every time a press is dragged over, and rubs out when the press starts on a painted one', () => {
  show();
  const [a, b, c] = [cell('Mon 30, 5 pm'), cell('Mon 30, 6 pm'), cell('Mon 30, 7 pm')];
  fireEvent.pointerDown(a); fireEvent.pointerEnter(b); fireEvent.pointerEnter(c); fireEvent.pointerUp(window);
  for (const each of [a, b, c]) expect(each).toHaveAttribute('aria-pressed', 'true');
  fireEvent.pointerEnter(cell('Mon 30, 8 pm'));
  expect(cell('Mon 30, 8 pm')).toHaveAttribute('aria-pressed', 'false');
  fireEvent.pointerDown(b); fireEvent.pointerEnter(c); fireEvent.pointerUp(window);
  expect(a).toHaveAttribute('aria-pressed', 'true');
  for (const each of [b, c]) expect(each).toHaveAttribute('aria-pressed', 'false');
});

it('moves with the arrow keys', () => {
  show();
  cell('Mon 30, 5 pm').focus();
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(cell('Tue 1, 5 pm'));
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(cell('Tue 1, 6 pm'));
  fireEvent.keyDown(cell('Mon 30, 5 pm'), { key: 'ArrowLeft' });
  expect(document.activeElement).toBe(cell('Tue 1, 6 pm'));
});

it('keeps nothing until Save, then hands over the painted times', async () => {
  const onSave = show({ mine: [TUE8] });
  expect(cell('Tue 1, 8 pm')).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Saved.');
  fireEvent.click(cell('Tue 1, 7 pm'));
  expect(screen.getByRole('status')).toHaveTextContent('Not saved yet.');
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save my times' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved.'));
  expect(onSave.mock.calls[0][0].sort()).toEqual([TUE7, TUE8]);
});

it('says so when the save fails, and shows carried-over times as not yet saved', async () => {
  show({ mine: [TUE8], draft: true, onSave: async () => ({ error: 'This poll is gone.' }) });
  expect(cell('Tue 1, 8 pm')).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Not saved yet.');
  fireEvent.click(screen.getByRole('button', { name: 'Save my times' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This poll is gone.');
});

it('asks someone with no account who they are on one card, a name or Loopd, and offers the invite once their times are saved', async () => {
  const onEmail = vi.fn<(email: string) => Promise<null>>(async () => null);
  const onSave = show({ me: { personId: 'guest', name: '', face: '' }, guest: { name: '', email: null }, onEmail, ways: <button>Google</button> });
  // Who they are comes first: the card is open on arrival, a name on one half and the ways into Loopd on the other.
  let card = within(screen.getByRole('dialog', { name: 'Whose times are these?' }));
  expect(card.getByRole('button', { name: 'Google' })).toBeInTheDocument();
  // Closed without a name, the poll can be looked at; painting asks again and paints nothing.
  fireEvent.click(card.getByRole('button', { name: 'Close' }));
  fireEvent.click(cell('Tue 1, 7 pm'));
  expect(cell('Tue 1, 7 pm')).toHaveAttribute('aria-pressed', 'false');
  card = within(screen.getByRole('dialog', { name: 'Whose times are these?' }));
  // No name yet: the card stays, and the box is where the cursor goes.
  fireEvent.click(card.getByRole('button', { name: 'Pick my times' }));
  expect(card.getByLabelText('Your name')).toHaveFocus();
  fireEvent.change(card.getByLabelText('Your name'), { target: { value: ' Aaron ' } });
  fireEvent.click(card.getByRole('button', { name: 'Pick my times' }));
  // With a name the card goes, nothing is sent yet, and painting works.
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(cell('Tue 1, 7 pm'));
  expect(screen.getByRole('img', { name: 'Aaron' })).toHaveTextContent('A');
  fireEvent.click(screen.getByRole('button', { name: 'Save my times' }));
  await waitFor(() => expect(screen.getByText('Saved as Aaron')).toBeInTheDocument());
  expect(onSave).toHaveBeenCalledWith([TUE7], 'Aaron');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(sessionStorage.getItem(`wn-keep:${location.pathname}`)).toBeNull();
  expect(screen.getByRole('button', { name: 'Not Aaron?' })).toBeInTheDocument();
  // The invite is an offer: a bad address is not sent, a good one is.
  fireEvent.change(screen.getByLabelText('Want the invite when the time is set?'), { target: { value: 'aaron' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send it to me' }));
  expect(onEmail).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Want the invite when the time is set?'), { target: { value: 'Aaron@Email.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send it to me' }));
  await waitFor(() => expect(screen.getByText('The invite goes to aaron@email.com')).toBeInTheDocument());
  expect(onEmail).toHaveBeenCalledWith('aaron@email.com');
  expect(screen.queryByRole('button', { name: 'Send it to me' })).toBeNull();
  // Painting again brings Save back, and it saves under the same name without asking.
  fireEvent.click(cell('Tue 1, 8 pm'));
  fireEvent.click(screen.getByRole('button', { name: 'Save my times' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('opens the card for the bar\'s "Sign in", and paints and saves what was kept once someone has signed in', async () => {
  show({ me: { personId: 'guest', name: 'Aaron', face: '' }, guest: { name: 'Aaron', email: null } });
  // Someone this browser knows by name is not asked on arrival, and paints straight away.
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(cell('Tue 1, 7 pm'));
  expect(cell('Tue 1, 7 pm')).toHaveAttribute('aria-pressed', 'true');
  // What is painted is kept in the tab while the card is open, so signing in from it does not lose it.
  fireEvent.click(screen.getByRole('button', { name: 'Save my times' }));
  cleanup(); sessionStorage.clear();
  show({ me: { personId: 'guest', name: '', face: '' }, guest: { name: '', email: null } });
  // The bar asks before opening its own card: a poll's guest card answers and opens.
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(window.dispatchEvent(new CustomEvent(WHO, { cancelable: true }))).toBe(false);
  expect(await screen.findByRole('dialog', { name: 'Whose times are these?' })).toBeInTheDocument();
  cleanup();
  // Signed in, the page loads again: the times kept in the tab are painted and saved, once.
  sessionStorage.setItem(`wn-keep:${location.pathname}`, JSON.stringify([TUE7, 'not a time']));
  const onSave = show({});
  await waitFor(() => expect(onSave).toHaveBeenCalledWith([TUE7], undefined));
  expect(cell('Tue 1, 7 pm')).toHaveAttribute('aria-pressed', 'true');
  expect(sessionStorage.getItem(`wn-keep:${location.pathname}`)).toBeNull();
});
