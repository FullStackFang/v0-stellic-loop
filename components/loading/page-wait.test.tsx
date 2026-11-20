import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TopBar } from '@/components/campus/top-bar';
import { animal } from '@/lib/campus/animals';
import { forget, lastBar, rememberMe } from './last-bar';
import { PageWait, PartWait } from './page-wait';
import { LINE } from './seats';

// What a page shows while it loads (openspec loop-loading-seats): after a page with the top bar, the bar stays.
let path = '/c/cornell';
vi.mock('next/navigation', () => ({ usePathname: () => path }));
afterEach(() => { forget(); path = '/c/cornell'; });

const BEAR = animal(37);
const faces = (box: HTMLElement) => [...box.querySelectorAll('.seats-row img')].map(img => img.getAttribute('src'));

describe('opening the app', () => {
  it('shows the ticket alone on the whole screen, with no bar', () => {
    const { container } = render(<PageWait />);
    expect(container.querySelector('.seats-screen')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(LINE);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(faces(container).at(-1)).toBe(animal(11));
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
  it('keeps the bar: the same links, and the ticket under it', () => {
    const container = from('Ink');
    expect(container.querySelector('.seats-screen')).toBeNull();
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['Loop', 'This week', 'Ink', 'Sign in']);
    expect(screen.getByRole('status')).toHaveTextContent(LINE);
  });
  it('marks the link that was pressed, which holds the small one, and no other', () => {
    from('Ink');
    expect(screen.getByRole('link', { name: 'Ink' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'This week' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Ink' }).querySelector('.seats-sm')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'This week' }).querySelector('.seats-sm')).toBeNull();
  });
  it('announces the wait once: the small one on the link says nothing', () => {
    from('Ink');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Ink' }).querySelector('.seats-linkwait')).toHaveAttribute('aria-hidden', 'true');
  });
  it('seats the person whose bar it was', () => {
    rememberMe({ face: BEAR, plan: 'ink', seed: 'Josh' });
    expect(faces(from('Ink')).at(-1)).toBe(BEAR);
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
  it('shows the ticket in the page\'s place, with the person\'s face', () => {
    rememberMe({ face: BEAR });
    const { container } = render(<PartWait />);
    expect(container.querySelector('.seats-screen')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(LINE);
    expect(faces(container).at(-1)).toBe(BEAR);
  });
});
