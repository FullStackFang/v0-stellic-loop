import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { animal } from '@/lib/campus/animals';
import { forget, rememberMe } from './last-bar';
import { LINE, SeatsSmall } from './seats';
import { FreshWait } from './fresh-wait';
import { PageWait, PartWait } from './page-wait';

// One ticket for a whole load, and one ending (public/demo/mockups-loading-one.html, direction B).
vi.mock('next/navigation', () => ({ usePathname: () => '/groups/extreme-cheapskates' }));
afterEach(() => { document.body.innerHTML = ''; forget(); });

const cover = () => document.querySelector('.seats-fresh');
const tickets = () => document.querySelectorAll('.seats-tk');
/** A piece of the page that has not come: what stands in its place. */
function piece(html: string) { const box = document.createElement('div'); box.innerHTML = html; document.body.append(box); return box; }
/** Lets the watcher hear what changed on the page. */
const settle = () => act(async () => { await Promise.resolve(); });
const PAGE = '<div data-seats-wait="page"></div>', PART = '<span data-seats-wait="part"></span>';

describe('the loaders', () => {
  it('say what they wait for: a page, or a part of a bar; any other small one says nothing', () => {
    expect(render(<SeatsSmall first />).container.querySelector('[data-seats-wait="part"]')).not.toBeNull();
    expect(render(<PageWait />).container.querySelector('[data-seats-wait="page"]')).not.toBeNull();
    expect(render(<PartWait />).container.querySelector('[data-seats-wait="page"]')).not.toBeNull();
    expect(render(<SeatsSmall />).container.querySelector('[data-seats-wait]')).toBeNull();
  });
});

describe('a fresh load', () => {
  it('has one ticket, the same one while each piece takes the place of the last', async () => {
    const page = piece(PAGE);
    render(<FreshWait />);
    const ticket = cover()!.querySelector('.seats-tk');
    expect(ticket).toHaveTextContent(LINE);
    // The layout lands: its bar, and the page's own loader in the first one's place.
    page.innerHTML = PART + PAGE;
    await settle();
    // The page lands; the bar's counters have not.
    page.innerHTML = PART + '<main>Members</main>';
    await settle();
    expect([...tickets()]).toEqual([ticket]);
  });
  it('ends when the last piece has come', async () => {
    const page = piece(PART + PAGE);
    render(<FreshWait />);
    page.innerHTML = '<main>Members</main>';
    await settle();
    expect(cover()).toBeNull();
    expect(tickets()).toHaveLength(0);
  });
  it('has no ticket at all on a page that had nothing to wait for', () => {
    piece('<main>Terms</main>');
    render(<FreshWait />);
    expect(tickets()).toHaveLength(0);
  });
});

describe('a change of page, after the first load', () => {
  /** The first load has wholly arrived. */
  async function arrived() { const page = piece('<main>Members</main>'); render(<FreshWait />); await settle(); return page; }

  it('has one ticket under the bar, the same one from the first loader to the last, with the person\'s face', async () => {
    rememberMe({ face: animal(37) });
    const page = await arrived();
    page.innerHTML = PAGE;
    await settle();
    expect(cover()).toBeNull();
    const [ticket] = tickets();
    expect(ticket.closest('.seats-page')).not.toBeNull();
    expect([...ticket.querySelectorAll('.seats-row img')].at(-1)).toHaveAttribute('src', animal(37));
    // The next layout lands with its own page loader in the first one's place.
    page.innerHTML = '<nav>Bar</nav>' + PAGE;
    await settle();
    expect([...tickets()]).toEqual([ticket]);
    page.innerHTML = '<nav>Bar</nav><main>Team</main>';
    await settle();
    expect(tickets()).toHaveLength(0);
  });
  it('is not held for a part of the bar: the page is there to use', async () => {
    const page = await arrived();
    page.innerHTML = PART + '<main>Team</main>';
    await settle();
    expect(tickets()).toHaveLength(0);
  });
});
