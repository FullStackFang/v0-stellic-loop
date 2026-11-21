import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TopBar } from '@/components/campus/top-bar';
import { forget, lastBar } from './last-bar';
import { PageWait, PartWait } from './page-wait';

// What a page shows while it loads (openspec loop-loading-seats): after a page with the top bar, the bar stays.
let path = '/c/cornell';
vi.mock('next/navigation', () => ({ usePathname: () => path }));
afterEach(() => { forget(); path = '/c/cornell'; });

/** The loader says the page is waiting, and draws no ticket of its own: the one ticket of the app stands over it (fresh-wait.tsx). */
const asks = (box: HTMLElement) => { expect(box.querySelector('[data-seats-wait="page"]')).not.toBeNull(); expect(box.querySelector('.seats-tk')).toBeNull(); };

describe('opening the app', () => {
  it('asks for the ticket on the whole screen, with no bar', () => {
    const { container } = render(<PageWait />);
    expect(container.querySelector('.seats-screen')).not.toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    asks(container);
  });
});

describe('changing page', () => {
  /** A page with the bar was shown, and one of its links pressed. */
  function from(press: string) {
    const page = render(<TopBar home="/c/cornell" on="week" account={<a href="/sign-in">Sign in</a>} />);
    fireEvent.click(screen.getByRole('link', { name: press }));
    page.unmount();
    return render(<PageWait />).container;
  }
  it('keeps the bar: the same links, and asks for the ticket under it', () => {
    const container = from('Ink');
    expect(container.querySelector('.seats-screen')).toBeNull();
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['Loopd', 'This week', 'Doodles', 'Ink', 'Claim your club', 'Sign in']);
    asks(container);
  });
  it('marks the link that was pressed, which holds the small one, and no other', () => {
    from('Ink');
    expect(screen.getByRole('link', { name: 'Ink' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'This week' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Ink' }).querySelector('.seats-sm')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'This week' }).querySelector('.seats-sm')).toBeNull();
  });
  it('the small one on the link says nothing: the ticket announces the wait', () => {
    from('Ink');
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Ink' }).querySelector('.seats-linkwait')).toHaveAttribute('aria-hidden', 'true');
  });
  it('forgets the pressed link once the next page has drawn its bar', () => {
    from('Ink');
    render(<TopBar home="/c/cornell" on="ink" account={null} />);
    expect(lastBar().going).toBeNull();
    expect(lastBar().bar?.on).toBe('ink');
  });
  it('to a page with no bar of its own (a shared link) shows the ticket alone', () => {
    path = '/e/abc';
    render(<TopBar home="/c/cornell" on="week" account={<a href="/sign-in">Sign in</a>} />).unmount();
    const { container } = render(<PageWait />);
    expect(container.querySelector('.seats-screen')).not.toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('a link never changes width for it: the box is always there, off the flow', () => {
    render(<TopBar home="/c/cornell" on="week" account={<a href="/sign-in">Sign in</a>} />);
    for (const link of screen.getByRole('navigation').querySelectorAll('a')) expect(link.querySelector('.seats-linkwait')).not.toBeNull();
  });
});

describe('a groups page', () => {
  it('asks for the ticket in the place of the page, under the bar that stayed', () => {
    const { container } = render(<PartWait />);
    expect(container.querySelector('.seats-screen')).toBeNull();
    asks(container);
  });
});
