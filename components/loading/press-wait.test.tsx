import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PressWait } from './press-wait';

afterEach(() => { cleanup(); vi.useRealTimers(); history.replaceState(null, '', '/'); });

/* eslint-disable @next/next/no-html-link-for-pages -- plain links stand in for Next's, which this test does not load */
// The app's links are Next's, which take the press themselves and move without leaving the page.
const stay = (event: React.MouseEvent) => event.preventDefault();
const page = () => render(<><a href="/groups/team-1/team" onClick={stay}>Team 1</a><a href="/" onClick={stay}>Here</a>
  <a href="https://example.com/" onClick={stay}>Elsewhere</a><a href="/c/doodles" onClick={stay}>Doodles<span className="seats-linkwait" /></a><PressWait /></>);

it('marks a pressed link and holds the small one on it until the address changes', () => {
  vi.useFakeTimers();
  const { container } = page(), link = screen.getByRole('link', { name: 'Team 1' });
  expect(container.querySelector('.seats-press')).toBeNull();
  fireEvent.click(link);
  expect(link).toHaveAttribute('data-going');
  expect(container.querySelector('.seats-press .seats-sm')).not.toBeNull();
  history.replaceState(null, '', '/groups/team-1/team');
  act(() => { vi.advanceTimersByTime(100); });
  expect(link).not.toHaveAttribute('data-going');
  expect(container.querySelector('.seats-press')).toBeNull();
});

it('lets go by itself when the page never comes', () => {
  vi.useFakeTimers();
  const { container } = page(), link = screen.getByRole('link', { name: 'Team 1' });
  fireEvent.click(link);
  act(() => { vi.advanceTimersByTime(8100); });
  expect(link).not.toHaveAttribute('data-going');
  expect(container.querySelector('.seats-press')).toBeNull();
});

it('leaves alone a link to this page, a link out of the app, a press that opens a new tab, and a link that holds its own', () => {
  const { container } = page();
  fireEvent.click(screen.getByRole('link', { name: 'Here' }));
  fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
  fireEvent.click(screen.getByRole('link', { name: 'Team 1' }), { ctrlKey: true });
  fireEvent.click(screen.getByRole('link', { name: 'Doodles' }));
  expect(container.querySelector('[data-going]')).toBeNull();
  expect(container.querySelector('.seats-press')).toBeNull();
});
