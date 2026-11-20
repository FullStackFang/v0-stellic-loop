import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { congaPlayer } from '@/lib/campus/conga';
import { campusViewer } from '@/lib/campus/session';

// The Conga game's page (public/conga/index.html, a plain page with its scripts beside it), with who is playing
// written into it as `congaPlayer`: null for someone signed out, who plays as before. It is a page and not a request
// the game makes afterwards, because only a page being opened renews a sign-in that has gone stale (proxy.ts reads the
// sign-in for /conga).
// Read once where the page cannot change under the server, and afresh while it is being worked on.
let kept: Promise<string> | undefined;
const read = () => readFile(path.join(process.cwd(), 'public', 'conga', 'index.html'), 'utf8');

export async function GET() {
  const page = process.env.NODE_ENV === 'production' ? (kept ??= read()) : read();
  const viewer = await campusViewer();
  const player = JSON.stringify(viewer ? await congaPlayer(db(), viewer) : null).replace(/</g, '\u003c');
  return new Response((await page).replace('<script type="module">', `<script>window.congaPlayer = ${player};</script>\n<script type="module">`), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' } });
}
