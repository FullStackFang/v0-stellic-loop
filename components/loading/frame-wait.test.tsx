import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FrameWait } from './frame-wait';
import { LINE } from './seats';

// A frame that has not loaded shows the small one and its line over its box (openspec loop-loading-seats, design D14).
afterEach(() => { vi.useRealTimers(); });

describe('a frame', () => {
  it('that has not loaded shows the small one and its line, with the frame already in place', () => {
    vi.useFakeTimers();
    const { container } = render(<FrameWait title="Map of Barton Hall" src="about:blank" />);
    // A frame that loads fast shows no loader: it waits 300 ms first.
    expect(screen.queryByRole('status')).toBeNull();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole('status')).toHaveTextContent(LINE);
    expect(screen.getByTitle('Map of Barton Hall')).toBeInTheDocument();
    expect(container.querySelector('.seats-over .seats-sm')).not.toBeNull();
  });
  it('that has loaded shows only itself', () => {
    render(<FrameWait title="Map of Barton Hall" src="about:blank" />);
    fireEvent.load(screen.getByTitle('Map of Barton Hall'));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTitle('Map of Barton Hall')).toBeInTheDocument();
  });
  it('that never says it loaded is not waited on for ever', () => {
    vi.useFakeTimers();
    render(<FrameWait title="Map" src="about:blank" />);
    act(() => { vi.advanceTimersByTime(7900); });
    expect(screen.queryByRole('status')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
