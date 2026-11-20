import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { congaPlayer } from '@/lib/campus/conga';
import { campusViewer } from '@/lib/campus/session';

// The Seats game's page (public/seats/index.html, a plain page), with who is playing written into it as `seatsPlayer`:
// null for someone signed out. The same person the Conga page is told of (app/conga), for the same reason: with Ink+
// one of their own animals plays. A page and not a request made afterwards, so that a stale sign-in is renewed
// (proxy.ts reads the sign-in for /seats).
let kept: Promise<string> | undefined;
const read = () => readFile(path.join(process.cwd(), 'public', 'seats', 'index.html'), 'utf8');

export async function GET() {
  const page = process.env.NODE_ENV === 'production' ? (kept ??= read()) : read();
  const viewer = await campusViewer();
  const player = JSON.stringify(viewer ? await congaPlayer(db(), viewer) : null).replace(/</g, '\\u003c');
  return new Response((await page).replace('<script>', () => `<script>window.seatsPlayer = ${player};</script>\n<script>`), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' } });
}
