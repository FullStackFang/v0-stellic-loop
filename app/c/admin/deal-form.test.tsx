import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

// The Deals tab's form stays on the page (openspec campus-deals, task 5.2). The action is stood in for; deal-action.test.tsx runs the real one.
const dealAction = vi.fn(async (data: FormData) => data.get('title') === 'bad' ? 'Not saved. Pick at least one day.' : `Pressed ${data.get('step')} on ${data.get('title') ?? data.get('deal')}`);
vi.mock('./actions', () => ({ dealAction: (data: FormData) => dealAction(data) }));
const { DealForm } = await import('./deal-form');

it('says what happened above the form, keeps what was typed when refused, and clears a new deal once saved', async () => {
  render(<DealForm fresh><input aria-label="Activity name" name="title" defaultValue="" /><button name="step" value="save">Add deal</button></DealForm>);
  const name = screen.getByLabelText('Activity name') as HTMLInputElement;
  fireEvent.change(name, { target: { value: 'bad' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add deal' })); });
  expect(await screen.findByRole('status')).toHaveTextContent('Not saved. Pick at least one day.');
  expect(name.value).toBe('bad');
  fireEvent.change(name, { target: { value: 'Drinks at Nisi Bistro' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add deal' })); });
  expect(await screen.findByText('Pressed save on Drinks at Nisi Bistro')).toBeInTheDocument();
  expect(name.value).toBe('');
});

it('sends the button pressed, so Hide and Show work from the same form', async () => {
  render(<DealForm><input type="hidden" name="deal" value="d1" /><button className="cs-btn sm" name="step" value="hide">Hide</button></DealForm>);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Hide' })); });
  expect(await screen.findByRole('status')).toHaveTextContent('Pressed hide on d1');
  expect(dealAction.mock.calls.at(-1)![0].get('step')).toBe('hide');
});
