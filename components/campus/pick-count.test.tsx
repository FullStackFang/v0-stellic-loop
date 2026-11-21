import { fireEvent, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PickCount } from './pick-count';

const grid = () => render(<form className="cs-adm-pick"><PickCount />
  <ul className="cs-adm-grid">{['a', 'b', 'c'].map(name => <li key={name}><input type="checkbox" aria-label={name} /></li>)}</ul>
  <button type="reset">Clear</button></form>);

it('keeps one animal picked: another tap moves the pick, and the same tap lets it go', async () => {
  const { container, getByLabelText, getByRole } = grid(), form = container.querySelector('form')!, box = (name: string) => getByLabelText(name) as HTMLInputElement;
  expect(form.dataset.picked).toBe('0');
  fireEvent.click(box('a'));
  expect(form.dataset.picked).toBe('1');
  fireEvent.click(box('b'));
  expect([box('a').checked, box('b').checked]).toEqual([false, true]);
  expect(form.dataset.picked).toBe('1');
  fireEvent.click(box('b'));
  expect(form.dataset.picked).toBe('0');
  fireEvent.click(box('c'));
  fireEvent.click(getByRole('button', { name: 'Clear' }));
  await new Promise(done => setTimeout(done));
  expect(form.dataset.picked).toBe('0');
});
