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
  fireEvent.click(box('a'));
  fireEvent.keyDown(box('a'), { key: 'Escape' });
  await new Promise(done => setTimeout(done));
  expect([box('a').checked, form.dataset.picked]).toEqual([false, '0']);
});

it("Enter in an animal's name saves that animal, never the first card's Delete", () => {
  // The browser's own Enter presses the form's first submit button: the first card's hidden "Delete for good".
  const pressed: string[] = [];
  const { getByLabelText } = render(<form className="cs-adm-pick" onSubmit={event => { event.preventDefault(); const by = (event.nativeEvent as SubmitEvent).submitter; pressed.push(`${by?.closest('li')?.dataset.pet} ${by?.textContent}`); }}><PickCount />
    <ul className="cs-adm-grid">{['a', 'b'].map(pet => <li key={pet} data-pet={pet}><input type="checkbox" aria-label={pet} defaultChecked={pet === 'b'} />
      <div className="cs-adm-card"><span className="cs-adm-row"><input aria-label={`Name of ${pet}`} /><details><summary>Delete</summary><button name="step" value="delete">Delete for good</button></details><button className="go" name="step" value="name">Save</button></span>
        <span className="cs-adm-words"><input aria-label={`Words of ${pet}`} /></span></div></li>)}</ul></form>);
  fireEvent.keyDown(getByLabelText('Name of b'), { key: 'Enter' });
  expect(pressed).toEqual(['b Save']);
  // The words box keeps its own Enter, which adds a word.
  fireEvent.keyDown(getByLabelText('Words of b'), { key: 'Enter' });
  expect(pressed).toEqual(['b Save']);
});
