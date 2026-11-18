// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import {FETCH_LIMITS,guardedFetch,isPrivateAddress,type Guard} from '@/lib/guarded-fetch';

const PUBLIC = ['93.184.216.34'];
const link = (...hosts: string[]): Guard => ({mode: 'link', hosts});
const feed: Guard = {mode: 'feed'};
const redirect = (to: string, status = 302) => new Response(null, {status, headers: {location: to}});
const ok = (text = 'hi') => new Response(text, {status: 200});

/** A fetch mock that answers each call from the queue; a function entry is called for that request. */
function queue(...answers: Array<Response | Error | (() => Promise<Response>)>) {
  const rest = [...answers];
  return vi.fn(async (_u: unknown, _i?: unknown) => {
    const a = rest.shift();
    if (!a) throw new Error('unexpected request');
    if (a instanceof Error) throw a;
    return typeof a === 'function' ? a() : a;
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}
const requested = (f: ReturnType<typeof queue>) => (f as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));

afterEach(() => vi.useRealTimers());

describe('guardedFetch: the URL', () => {
  it('refuses http without requesting', async () => {
    const f = queue(ok());
    expect(await guardedFetch('http://a.test/x', link('a.test'), {fetch: f})).toEqual({ok: false, reason: 'refused'});
    expect(f).not.toHaveBeenCalled();
  });
  it('refuses credentials, a port, and junk', async () => {
    const f = queue(ok());
    for (const u of ['https://u:p@a.test/', 'https://u@a.test/', 'https://a.test:8443/', 'not a url']) {
      expect(await guardedFetch(u, link('a.test'), {fetch: f})).toEqual({ok: false, reason: 'refused'});
    }
    expect(f).not.toHaveBeenCalled();
  });
  it('sends a bare GET', async () => {
    const f = queue(ok('body'));
    const r = await guardedFetch('https://a.test/x', link('a.test'), {fetch: f, accept: 'text/calendar'});
    expect(r).toEqual({ok: true, url: 'https://a.test/x', text: 'body'});
    const init = (f as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(init).toMatchObject({method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store'});
    expect(init.headers).toEqual({'user-agent': 'Mozilla/5.0 (compatible; event-reader)', accept: 'text/calendar'});
    expect(Object.keys(init.headers as object).map((k) => k.toLowerCase())).not.toEqual(expect.arrayContaining(['cookie', 'authorization', 'referer']));
  });
  it('defaults accept to html', async () => {
    const f = queue(ok());
    await guardedFetch('https://a.test/', link('a.test'), {fetch: f});
    expect(((f as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).headers).toMatchObject({accept: 'text/html,application/xhtml+xml'});
  });
});

describe('guardedFetch: status, size, time', () => {
  it('maps statuses', async () => {
    const run = (res: Response | Error) => guardedFetch('https://a.test/', link('a.test'), {fetch: queue(res)});
    expect(await run(new Response('', {status: 404}))).toEqual({ok: false, reason: 'gone'});
    expect(await run(new Response('', {status: 410}))).toEqual({ok: false, reason: 'gone'});
    expect(await run(new Response('', {status: 500}))).toEqual({ok: false, reason: 'failed'});
    expect(await run(new Response('', {status: 403}))).toEqual({ok: false, reason: 'failed'});
    expect(await run(new Error('boom'))).toEqual({ok: false, reason: 'failed'});
  });
  it('fails a streamed body over the cap', async () => {
    let sent = 0;
    const chunk = new Uint8Array(1_000_000);
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        const n = Math.min(chunk.length, FETCH_LIMITS.bytes + 1 - sent);
        if (n === 0) return c.close();
        c.enqueue(chunk.subarray(0, n));
        sent += n;
      },
    });
    const r = await guardedFetch('https://a.test/', link('a.test'), {fetch: queue(new Response(body, {status: 200}))});
    expect(r).toEqual({ok: false, reason: 'failed'});
  });
  it('fails early on a content-length over the cap', async () => {
    const res = new Response('x', {status: 200, headers: {'content-length': String(FETCH_LIMITS.bytes + 1)}});
    expect(await guardedFetch('https://a.test/', link('a.test'), {fetch: queue(res)})).toEqual({ok: false, reason: 'failed'});
  });
  it('fails a hung request at the time budget', async () => {
    vi.useFakeTimers();
    const hung = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
    })) as unknown as typeof fetch;
    const p = guardedFetch('https://a.test/', link('a.test'), {fetch: hung});
    await vi.advanceTimersByTimeAsync(FETCH_LIMITS.ms + 1);
    expect(await p).toEqual({ok: false, reason: 'failed'});
  });
  it('fails a body that stalls past the budget', async () => {
    vi.useFakeTimers();
    const body = new ReadableStream<Uint8Array>({pull: () => new Promise(() => {})});
    const p = guardedFetch('https://a.test/', link('a.test'), {fetch: queue(new Response(body, {status: 200}))});
    await vi.advanceTimersByTimeAsync(FETCH_LIMITS.ms + 1);
    expect(await p).toEqual({ok: false, reason: 'failed'});
  });
});

describe('guardedFetch: redirects', () => {
  it('follows 3 and refuses the 4th', async () => {
    const g = link('a.test');
    const three = queue(redirect('/1'), redirect('/2', 301), redirect('/3', 307), ok('end'));
    expect(await guardedFetch('https://a.test/0', g, {fetch: three})).toEqual({ok: true, url: 'https://a.test/3', text: 'end'});
    const four = queue(redirect('/1'), redirect('/2'), redirect('/3'), redirect('/4'), ok());
    expect(await guardedFetch('https://a.test/0', g, {fetch: four})).toEqual({ok: false, reason: 'refused'});
    expect(four).toHaveBeenCalledTimes(4);
  });
  it('link mode: off-list first host makes no request', async () => {
    const f = queue(ok());
    expect(await guardedFetch('https://evil.test/', link('a.test'), {fetch: f})).toEqual({ok: false, reason: 'refused'});
    expect(f).not.toHaveBeenCalled();
  });
  it('link mode: off-list redirect is refused and never requested', async () => {
    const f = queue(redirect('https://evil.test/x'), ok());
    expect(await guardedFetch('https://a.test/', link('a.test'), {fetch: f})).toEqual({ok: false, reason: 'refused'});
    expect(requested(f)).toEqual(['https://a.test/']);
  });
  it('link mode: redirect between listed hosts works', async () => {
    const f = queue(redirect('https://B.test/y'), ok('there'));
    expect(await guardedFetch('https://a.test/', link('a.test', 'b.test'), {fetch: f})).toEqual({ok: true, url: 'https://b.test/y', text: 'there'});
  });
  it('link mode does no DNS lookup', async () => {
    const lookup = vi.fn(async () => PUBLIC);
    await guardedFetch('https://a.test/', link('a.test'), {fetch: queue(ok()), lookup});
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('guardedFetch: feed mode', () => {
  it('refuses private literals on the first hop with no request', async () => {
    const f = queue(ok());
    const lookup = vi.fn(async () => PUBLIC);
    for (const host of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '169.254.169.254', '[fc00::1]', '[fe80::1]', '[::ffff:127.0.0.1]', '[::1]', '8.8.8.8']) {
      expect(await guardedFetch(`https://${host}/`, feed, {fetch: f, lookup})).toEqual({ok: false, reason: 'refused'});
    }
    expect(f).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });
  it('refuses hosts that resolve to private addresses, or fail to resolve', async () => {
    const f = queue(ok());
    const via = (addrs: string[] | Error) => guardedFetch('https://a.test/', feed, {fetch: f, lookup: async () => { if (addrs instanceof Error) throw addrs; return addrs; }});
    expect(await via(['127.0.0.1'])).toEqual({ok: false, reason: 'refused'});
    expect(await via(['8.8.8.8', '10.0.0.5'])).toEqual({ok: false, reason: 'refused'});
    expect(await via([])).toEqual({ok: false, reason: 'refused'});
    expect(await via(new Error('nxdomain'))).toEqual({ok: false, reason: 'refused'});
    expect(f).not.toHaveBeenCalled();
  });
  it('fetches a public host', async () => {
    const lookup = vi.fn(async () => PUBLIC);
    const r = await guardedFetch('https://a.test/f', feed, {fetch: queue(ok('feed')), lookup});
    expect(r).toEqual({ok: true, url: 'https://a.test/f', text: 'feed'});
    expect(lookup).toHaveBeenCalledWith('a.test');
  });
  it('re-checks a redirect target, which is never requested when private', async () => {
    const f = queue(redirect('https://internal.test/'), ok());
    const lookup = vi.fn(async (h: string) => (h === 'internal.test' ? ['10.0.0.9'] : PUBLIC));
    expect(await guardedFetch('https://a.test/', feed, {fetch: f, lookup})).toEqual({ok: false, reason: 'refused'});
    expect(requested(f)).toEqual(['https://a.test/']);
  });
  it('refuses a redirect to an IP literal', async () => {
    const f = queue(redirect('https://127.0.0.1/'), ok());
    expect(await guardedFetch('https://a.test/', feed, {fetch: f, lookup: async () => PUBLIC})).toEqual({ok: false, reason: 'refused'});
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('isPrivateAddress', () => {
  const cases: Array<[string, boolean]> = [
    ['0.0.0.0', true], ['0.1.2.3', true], ['10.0.0.1', true], ['100.64.0.1', true], ['100.127.255.255', true], ['100.128.0.1', false],
    ['127.0.0.1', true], ['169.254.169.254', true], ['172.16.0.1', true], ['172.31.255.255', true], ['172.32.0.1', false],
    ['192.0.0.8', true], ['192.0.2.1', false], ['192.168.0.1', true], ['198.18.0.1', true], ['198.19.255.255', true], ['198.20.0.1', false],
    ['224.0.0.1', true], ['240.0.0.1', true], ['255.255.255.255', true], ['8.8.8.8', false], ['93.184.216.34', false],
    ['::', true], ['::1', true], ['fc00::1', true], ['fd12:3456::1', true], ['fe80::1', true], ['febf::1', true], ['fec0::1', false],
    ['ff02::1', true], ['::ffff:127.0.0.1', true], ['::ffff:7f00:1', true], ['::ffff:8.8.8.8', false], ['::ffff:808:808', false],
    ['64:ff9b::7f00:1', true], ['64:ff9b::808:808', false], ['2606:4700:4700::1111', false], ['2001:4860:4860::8888', false],
    ['', true], ['example.com', true], ['999.1.1.1', true], ['1.2.3', true],
  ];
  it.each(cases)('%s -> %s', (ip, expected) => expect(isPrivateAddress(ip)).toBe(expected));
});
