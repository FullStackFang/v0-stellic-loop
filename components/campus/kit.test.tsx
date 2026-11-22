import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { kitScript } from '@/lib/campus/kit-script';
import { Kit, Kits } from './kit';

// The Ink+ card signs up from where it is (components/campus/join-plan.tsx), which refreshes the page once done.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// Other schools' colours are an Ink+ perk (public/demo/mockups-ink-colours.html, "My pick"): Loopd's and your schools'
// are free, the account card shows those and "Any school", and the rest wear the Ink mark.
const root = document.documentElement;
const reset = () => { localStorage.clear(); delete root.dataset.kit; delete root.dataset.kits; delete root.dataset.anyKit; };
beforeEach(reset);
afterEach(() => { cleanup(); reset(); });
const pills = () => within(screen.getByRole('group', { name: 'Colours' })).getAllByRole('button').map(pill => pill.textContent);

it('shows Loopd, your school and "Any school"; another school opens the Ink+ card, named for it', () => {
  root.dataset.kit = 'cornell';
  render(<Kits yours={['loop', 'cornell']} any={false} />);
  expect(pills()).toEqual(['Loopd', 'Cornell', 'Any school']);
  fireEvent.click(screen.getByRole('button', { name: 'Any school' }));
  expect(screen.getByRole('link', { name: 'Every school comes with Ink+' })).toHaveAttribute('href', '/c/ink');
  fireEvent.click(screen.getByRole('button', { name: 'NYU, with Ink+' }));
  expect(screen.getByRole('dialog', { name: "NYU's colours come with Ink+" })).toHaveTextContent("Wear NYU's colours");
  // Nothing was put on.
  expect(root.dataset.kit).toBe('cornell');
  expect(localStorage.getItem('loop-kit')).toBeNull();
});

it('with Ink+, any school may be picked from the list, and then shows beside yours', async () => {
  root.dataset.kit = 'cornell';
  render(<Kits yours={['loop', 'cornell']} any />);
  fireEvent.click(screen.getByRole('button', { name: 'Any school' }));
  expect(screen.queryByRole('link', { name: /Every school/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'NYU' }));
  expect(root.dataset.kit).toBe('nyu');
  await act(async () => {});
  expect(pills()).toEqual(['Loopd', 'Cornell', 'NYU', 'Any school']);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('passes over a pick kept from before that is not yours to wear', () => {
  localStorage.setItem('loop-kit', 'nyu');
  render(<Kit own="cornell" yours={['loop', 'cornell']} any={false} />);
  expect(root.dataset.kit).toBe('cornell');
  expect(root.dataset.kits).toBe('loop cornell');
  expect(root.dataset.anyKit).toBeUndefined();
});

it('keeps that pick with Ink+, and signed out', () => {
  localStorage.setItem('loop-kit', 'nyu');
  const { unmount } = render(<Kit own="cornell" yours={['loop', 'cornell']} any />);
  expect(root.dataset.kit).toBe('nyu');
  unmount(); reset(); localStorage.setItem('loop-kit', 'nyu');
  render(<Kit own="loop" yours={null} any />);
  expect(root.dataset.kit).toBe('nyu');
  expect(root.dataset.kits).toBeUndefined();
});

// A page that is the same for everyone (Terms, Privacy) cannot know the person's school: there, with nothing picked,
// it wears the colours this browser last wore, and Loopd's own only on a first visit (openspec loop-lighter-pages, D3).
it('where asked, falls back to the colours this browser last wore before its own', () => {
  localStorage.setItem('loop-kit-worn', 'cornell');
  const { unmount } = render(<Kit own="loop" yours={null} any worn />);
  expect(root.dataset.kit).toBe('cornell');
  unmount(); reset(); localStorage.setItem('loop-kit-worn', 'cornell'); localStorage.setItem('loop-kit', 'nyu');
  const picked = render(<Kit own="loop" yours={null} any worn />);
  expect(root.dataset.kit).toBe('nyu');
  picked.unmount(); reset(); localStorage.setItem('loop-kit-worn', 'cornell');
  render(<Kit own="loop" yours={null} any />);
  expect(root.dataset.kit).toBe('loop');
});

it('the script before the first paint falls back the same way', () => {
  const run = (script: string) => new Function(script)();
  localStorage.setItem('loop-kit-worn', 'cornell');
  run(kitScript('loop', null, true, true));
  expect(root.dataset.kit).toBe('cornell');
  reset(); localStorage.setItem('loop-kit-worn', 'cornell'); localStorage.setItem('loop-kit', 'nyu');
  run(kitScript('loop', null, true, true));
  expect(root.dataset.kit).toBe('nyu');
  reset();
  run(kitScript('loop', null, true, true));
  expect([root.dataset.kit, localStorage.getItem('loop-kit-worn')]).toEqual(['loop', 'loop']);
  reset(); localStorage.setItem('loop-kit-worn', 'cornell');
  run(kitScript('loop', null, true));
  expect(root.dataset.kit).toBe('loop');
});

it('the script before the first paint is drawn by the server only, never when Kit is reached without a page load', () => {
  expect(renderToString(<Kit own="cornell" yours={['loop', 'cornell']} any={false} />)).toContain(`<script>${kitScript('cornell', ['loop', 'cornell'], false)}</script>`);
  const { container } = render(<Kit own="cornell" yours={['loop', 'cornell']} any={false} />);
  expect(container.querySelector('script')).toBeNull();
});

it('the script before the first paint follows the same rule', () => {
  const run = (script: string) => new Function(script)();
  localStorage.setItem('loop-kit', 'nyu');
  run(kitScript('cornell', ['loop', 'cornell'], false));
  expect([root.dataset.kit, root.dataset.kits, root.dataset.anyKit]).toEqual(['cornell', 'loop cornell', undefined]);
  reset(); localStorage.setItem('loop-kit', 'nyu');
  run(kitScript('cornell', ['loop', 'cornell'], true));
  expect([root.dataset.kit, root.dataset.anyKit]).toEqual(['nyu', '']);
  reset(); localStorage.setItem('loop-kit', 'loop');
  run(kitScript('cornell', ['loop', 'cornell'], false));
  expect(root.dataset.kit).toBe('loop');
  reset();
  run(kitScript('</script>', null, true));
  expect(root.dataset.kit).toBe('</script>');
});
