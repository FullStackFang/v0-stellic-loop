import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FrameWait } from './frame-wait';
import { LINE } from './seats';

// A frame that has not loaded shows the small one and its line over its box (openspec loop-loading-seats, design D14).
afterEach(() => { vi.useRealTimers(); });

describe('a frame', () => {
  it('that has not loaded shows the small one and its line, with the frame already in place', () => {
    const { container } = render(<FrameWait title="Map of Barton Hall" src="about:blank" />);
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
    act(() => { vi.advanceTimersByTime(8100); });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
