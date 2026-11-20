import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { inkBlot } from '@/lib/campus/ink-blot';
import { POST } from '@/app/api/errors/route';
import { errorCode } from './code';
import { Spill } from './spill';

// "The spill" (public/demo/mockups-error-pages.html, direction C): the page for an address that leads nowhere and for a
// page that broke. A broken page shows a code, draws its blot from it, and tells the server.
vi.mock('next/navigation', () => ({ usePathname: () => '/groups/nowhere' }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('the code of an error', () => {
  it('is the one the server logged, when there is one', () => {
    expect(errorCode(Object.assign(new Error('x'), { digest: '4252701705' }))).toBe('4252701705');
  });
  it('is worked out from what was thrown otherwise, the same every time', () => {
    const code = errorCode(new Error('Cannot read properties of undefined'));
    expect(code).toMatch(/^\d{10}$/);
    expect(errorCode(new Error('Cannot read properties of undefined'))).toBe(code);
    expect(errorCode(new Error('Something else'))).not.toBe(code);
    expect(errorCode('a string was thrown')).toMatch(/^\d{10}$/);
  });
});

describe('an address that leads nowhere', () => {
  it('says so, and offers the ways back', () => {
    render(<Spill kind="lost" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nothing here but ink.');
    expect(screen.getByRole('link', { name: 'This week' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Your groups' })).toHaveAttribute('href', '/groups');
    expect(screen.queryByText(/^Code/)).toBeNull();
  });
  it('spills more where the page is pressed, and not where the plate is', () => {
    const { container } = render(<Spill kind="lost" />), count = () => container.querySelectorAll('.sp-more').length;
    fireEvent.pointerDown(container.querySelector('.sp-stage')!, { clientX: 40, clientY: 60 });
    expect(count()).toBe(1);
    fireEvent.pointerDown(screen.getByRole('heading', { level: 1 }), { clientX: 40, clientY: 60 });
    expect(count()).toBe(1);
  });
});

describe('a page that broke', () => {
  const broken = Object.assign(new Error('boom'), { digest: '4252701705' });
  it('shows the code, draws its blot from it, and tells the server once', () => {
    const sent = vi.fn(async () => new Response(null, { status: 204 })); vi.stubGlobal('fetch', sent); vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container, rerender } = render(<Spill kind="broke" error={broken} retry={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('We spilled something.');
    expect(screen.getByRole('button', { name: /Code 4252701705/ })).toBeInTheDocument();
    expect(container.querySelector('.sp-blot path')).toHaveAttribute('d', inkBlot('4252701705').school);
    rerender(<Spill kind="broke" error={broken} retry={() => {}} />);
    expect(sent).toHaveBeenCalledTimes(1);
    const [address, sentWith] = sent.mock.calls[0] as unknown as [string, RequestInit];
    expect(address).toBe('/api/errors');
    expect(JSON.parse(sentWith.body as string)).toEqual({ code: '4252701705', path: '/groups/nowhere', message: 'boom', server: true });
  });
  it('tries again when asked', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 }))); vi.spyOn(console, 'error').mockImplementation(() => {});
    const retry = vi.fn();
    render(<Spill kind="broke" error={broken} retry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('copies the code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 }))); vi.spyOn(console, 'error').mockImplementation(() => {});
    const writeText = vi.fn(async () => {}); vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<Spill kind="broke" error={broken} retry={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Code 4252701705/ }));
    expect(writeText).toHaveBeenCalledWith('4252701705');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });
});

describe('what the server keeps of an error', () => {
  const post = (body: unknown) => POST(new Request('http://loop.test/api/errors', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
  it('writes one line with the code, the page and the message, cut to size', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await post({ code: '4252701705', path: '/groups/team-1', message: 'x'.repeat(900), server: true })).status).toBe(204);
    const [label, line] = log.mock.calls[0] as [string, string];
    expect(label).toBe('page error');
    expect(JSON.parse(line)).toEqual({ code: '4252701705', path: '/groups/team-1', message: 'x'.repeat(300), server: true });
  });
  it('refuses what is not a report', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await post('not json')).status).toBe(400);
    expect((await post({ code: 'a code with spaces\nand a line', path: '/' })).status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });
});
