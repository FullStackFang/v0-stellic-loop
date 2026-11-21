import { fireEvent, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PickCount } from './pick-count';

const grid = () => render(<form className="cs-adm-pick"><PickCount />
  <ul className="cs-adm-grid">{['a', 'b', 'c'].map(name => <li key={name}><input type="checkbox" aria-label={name} /></li>)}</ul>
  <button type="reset">Clear</button></form>);

it('marks the form with how many animals are picked, so one alone shows its card and not the bar', async () => {
  const { container, getByLabelText, getByRole } = grid(), form = container.querySelector('form')!;
  expect(form.dataset.picked).toBe('0');
  fireEvent.click(getByLabelText('a'));
  expect(form.dataset.picked).toBe('1');
  fireEvent.click(getByLabelText('b'));
  expect(form.dataset.picked).toBe('2');
  fireEvent.click(getByRole('button', { name: 'Clear' }));
  await new Promise(done => setTimeout(done));
  expect(form.dataset.picked).toBe('0');
});
