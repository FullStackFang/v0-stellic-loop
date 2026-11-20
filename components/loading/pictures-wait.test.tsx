import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PicturesWait } from './pictures-wait';

// A grid of pictures is shown whole or not at all: the ticket stands over it until every picture has arrived.
afterEach(() => { vi.useRealTimers(); });
/* eslint-disable @next/next/no-img-element -- pictures in a test */
const grid = () => render(<PicturesWait className="cs-pets-grid" label="Pick your picture">
  <img src="/animals/01.png" alt="" /><img src="/animals/custom/a" alt="" /></PicturesWait>);
const busy = (container: HTMLElement) => container.querySelector('.seats-pics')!.hasAttribute('aria-busy');

describe('a grid of pictures', () => {
  it('stays under the ticket until every picture has loaded, then shows whole', () => {
    vi.useFakeTimers();
    const { container } = grid();
    const [one, two] = container.querySelectorAll('img');
    expect(busy(container)).toBe(true);
    act(() => { vi.advanceTimersByTime(300); });
    expect(container.querySelector('.seats-pics-tk .seats-tk')).not.toBeNull();
    fireEvent.load(one);
    expect(busy(container)).toBe(true);
    fireEvent.load(two);
    expect(busy(container)).toBe(false);
    expect(container.querySelector('.seats-pics-tk')).toBeNull();
    // The grid was there all along, so its buttons and pictures are the same ones.
    expect(screen.getByRole('group', { name: 'Pick your picture' })).toContainElement(two);
  });

  it('asks once more for a picture that failed, and does not wait on one that fails twice', () => {
    const { container } = grid();
    const [one, two] = container.querySelectorAll('img');
    fireEvent.load(one);
    fireEvent.error(two);
    expect(two.getAttribute('src')).toMatch(/\/animals\/custom\/a\?again=1$/);
    expect(busy(container)).toBe(true);
    fireEvent.error(two);
    expect(busy(container)).toBe(false);
  });

  it('shows what has come after ten seconds, whatever is still on its way', () => {
    vi.useFakeTimers();
    const { container } = grid();
    act(() => { vi.advanceTimersByTime(9_999); });
    expect(busy(container)).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(busy(container)).toBe(false);
  });
});
