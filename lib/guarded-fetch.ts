import 'server-only';
import {promises as dns} from 'node:dns';
import {isIP} from 'node:net';

export type Guard = {mode: 'link'; hosts: readonly string[]} | {mode: 'feed'};
export type Fetched =
  | {ok: true; url: string; text: string}
  | {ok: false; reason: 'refused'}
  | {ok: false; reason: 'gone'}
  | {ok: false; reason: 'failed'};
export type GuardDeps = {fetch?: typeof fetch; lookup?: (host: string) => Promise<string[]>; accept?: string};

export const FETCH_LIMITS = {ms: 15_000, bytes: 5_000_000, redirects: 3} as const;

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const lookupAll = async (host: string) => (await dns.lookup(host, {all: true})).map((a) => a.address);

function privateV4(a: number, b: number, c: number): boolean {
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
}

/** True for an address that is not a public unicast one. Exported for tests. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return privateV4(a, b, c);
  }
  if (kind !== 6 || ip.includes('%')) return true;
  let s = ip;
  const tail = s.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) s = `${tail[1]}${((+tail[2] << 8) | +tail[3]).toString(16)}:${((+tail[4] << 8) | +tail[5]).toString(16)}`;
  const [h, t] = s.split('::');
  const head = h ? h.split(':') : [];
  const rest = t ? t.split(':') : [];
  const g = (t === undefined ? head : [...head, ...Array(8 - head.length - rest.length).fill('0'), ...rest]).map((x) => parseInt(x, 16));
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  const embedded = () => privateV4(g[6] >> 8, g[6] & 255, g[7] >> 8);
  if (zero(0, 6)) return embedded(); // "::", "::1" and the old IPv4-compatible form
  if (zero(0, 5) && g[5] === 0xffff) return embedded(); // IPv4-mapped
  if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return embedded(); // NAT64
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00;
}

async function allowed(u: URL, guard: Guard, lookup: (host: string) => Promise<string[]>): Promise<boolean> {
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  if (guard.mode === 'link') return guard.hosts.includes(host);
  if (host.startsWith('[') || isIP(host)) return false;
  try {
    const addrs = await lookup(host);
    return addrs.length > 0 && !addrs.some(isPrivateAddress);
  } catch {
    return false;
  }
}

async function readText(res: Response, signal: AbortSignal): Promise<string | null> {
  if (Number(res.headers.get('content-length')) > FETCH_LIMITS.bytes || !res.body) return null;
  const reader = res.body.getReader();
  const onAbort = () => void reader.cancel().catch(() => {});
  signal.addEventListener('abort', onAbort);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (signal.aborted) return null;
      if (done) break;
      size += value.length;
      if (size > FETCH_LIMITS.bytes) {
        void reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function guardedFetch(url: string, guard: Guard, deps: GuardDeps = {}): Promise<Fetched> {
  const doFetch = deps.fetch ?? fetch;
  const lookup = deps.lookup ?? lookupAll;
  const headers = {'user-agent': 'Mozilla/5.0 (compatible; event-reader)', accept: deps.accept ?? 'text/html,application/xhtml+xml'};
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_LIMITS.ms);
  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      let u: URL;
      try {
        u = new URL(current);
      } catch {
        return {ok: false, reason: 'refused'};
      }
      if (!(await allowed(u, guard, lookup))) return {ok: false, reason: 'refused'};
      const res = await doFetch(u.href, {method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', headers, signal: ctl.signal});
      const location = res.headers.get('location');
      if (REDIRECTS.has(res.status) && location) {
        void res.body?.cancel().catch(() => {});
        if (hop >= FETCH_LIMITS.redirects) return {ok: false, reason: 'refused'};
        current = new URL(location, u).href;
        continue;
      }
      if (res.status === 404 || res.status === 410) return {ok: false, reason: 'gone'};
      if (res.status < 200 || res.status > 299) return {ok: false, reason: 'failed'};
      const text = await readText(res, ctl.signal);
      return text === null ? {ok: false, reason: 'failed'} : {ok: true, url: u.href, text};
    }
  } catch {
    return {ok: false, reason: 'failed'};
  } finally {
    clearTimeout(timer);
  }
}
