import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const animalAction = vi.fn(async (data: FormData) => `Pressed ${data.get('step') ?? `tier ${data.get('tier')}`} on ${data.getAll('picture').join(',')}`);
vi.mock('./actions', () => ({ animalAction: (data: FormData) => animalAction(data) }));
const { AnimalForm } = await import('./animal-form');

it('saves without leaving the page: the line shows, the open animal stays open, and the press is the one made', async () => {
  render(<AnimalForm className="cs-adm-pick"><input type="hidden" name="campus" value="cornell" />
    <ul className="cs-adm-grid">{['a', 'b'].map(pet => <li key={pet}><input type="checkbox" name="picture" value={pet} aria-label={pet} />
      <button name="step" value="name">Save {pet}</button><button name="tier" value="premium">Premium {pet}</button></li>)}</ul></AnimalForm>);
  // Picked by a tap, so React's clearing of the form after the press would let it go.
  fireEvent.click(screen.getByLabelText('b'));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save b' })); });
  expect(await screen.findByRole('status')).toHaveTextContent('Pressed name on b');
  expect((screen.getByLabelText('b') as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText('a') as HTMLInputElement).checked).toBe(false);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Premium b' })); });
  expect(await screen.findByText('Pressed tier premium on b')).toBeInTheDocument();
  expect((screen.getByLabelText('b') as HTMLInputElement).checked).toBe(true);
  expect(animalAction).toHaveBeenCalledTimes(2);
});
