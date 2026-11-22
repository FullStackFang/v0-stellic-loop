import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { slotsOf } from '@/lib/when/slots';
import { Grid } from './grid';

vi.mock('../actions', () => ({}));
afterEach(cleanup);

const slots = slotsOf({ startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: 'America/New_York' });
const TUE7 = '2026-12-02T00:00:00.000Z', TUE8 = '2026-12-02T01:00:00.000Z';
const cell = (name: string) => screen.getByRole('button', { name });
function show(over: Partial<Parameters<typeof Grid>[0]> = {}) {
  const onSave = vi.fn<(slots: string[]) => Promise<null>>(async () => null);
  render(<Grid slots={slots} others={{ [TUE7]: 2 }} mine={[]} onSave={onSave} after="Saved." {...over} />);
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
