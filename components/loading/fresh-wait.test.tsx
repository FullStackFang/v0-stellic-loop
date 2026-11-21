import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { SeatsSmall } from './seats';
import { FreshWait } from './fresh-wait';
import { PageWait, PartWait } from './page-wait';

// A fresh load is one ticket, then everything (public/demo/mockups-loading-one.html, direction B).
vi.mock('next/navigation', () => ({ usePathname: () => '/groups/extreme-cheapskates' }));
afterEach(() => { document.body.innerHTML = ''; });

const cover = () => document.querySelector('.seats-fresh');
/** A piece of the page that has not come: what the server sent in its place. */
function piece(html: string) { const box = document.createElement('div'); box.innerHTML = html; document.body.append(box); return box; }
/** Lets the watcher hear what changed on the page. */
const settle = () => act(async () => { await Promise.resolve(); });

describe('the loaders a fresh load is held for', () => {
  it('are the page-sized ones and the small one of a bar, and no other small one', () => {
    for (const loader of [<PageWait key="page" />, <PartWait key="part" />, <SeatsSmall key="bar" first />]) {
      const { container, unmount } = render(loader);
      expect(container.querySelector('[data-seats-wait]')).not.toBeNull();
      unmount();
    }
    expect(render(<SeatsSmall />).container.querySelector('[data-seats-wait]')).toBeNull();
  });
});

describe('the one ticket of a fresh load', () => {
  it('stays while any first wait is on the page, through one piece taking the place of another', async () => {
    const page = piece('<div data-seats-wait></div>');
    render(<FreshWait />);
    expect(cover()).not.toBeNull();
    const ticket = cover()!.querySelector('.seats-tk');
    // The layout lands: its bar, still waiting for its counters, and the page's own loader.
    page.innerHTML = '<span data-seats-wait></span><div data-seats-wait></div>';
    await settle();
    expect(cover()!.querySelector('.seats-tk')).toBe(ticket);
    // The page lands; the counters have not.
    page.innerHTML = '<span data-seats-wait></span><main>Members</main>';
    await settle();
    expect(cover()!.querySelector('.seats-tk')).toBe(ticket);
  });
  it('goes when the last piece has come, and does not come back for a later change of page', async () => {
    const page = piece('<div data-seats-wait></div>');
    render(<FreshWait />);
    page.innerHTML = '<main>Members</main>';
    await settle();
    expect(cover()).toBeNull();
    page.innerHTML = '<div data-seats-wait></div>';
    await settle();
    expect(cover()).toBeNull();
  });
  it('is not there at all on a page that had nothing to wait for', () => {
    piece('<main>Terms</main>');
    render(<FreshWait />);
    expect(cover()).toBeNull();
  });
});
