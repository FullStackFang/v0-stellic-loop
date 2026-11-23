import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { congaPlayer } from '@/lib/campus/conga';
import { congaBoards } from '@/lib/campus/conga-board';
import { campusViewer } from '@/lib/campus/session';

// The Conga game itself (public/conga/index.html, a plain page with its scripts beside it), shown full-screen inside the
// app page at /conga (app/conga/page.tsx), which lays the app's bar and foot over it while it is not being played. Written
// into it: who is playing, as `congaPlayer` (null for someone signed out, who plays as before), and this week's board for
// each map, as `congaBoard`. It is a page and not a request the game makes afterwards, because only a page being opened
// renews a sign-in that has gone stale (proxy.ts reads the sign-in for /conga).
// The page is read from /conga/play, so its addresses are read from the site's root (`base`), and its links open in the
// whole window rather than in the frame. It is counted as a visit by the app page round it.
// Read once where the page cannot change under the server, and afresh while it is being worked on.
let kept: Promise<string> | undefined;
const read = () => readFile(path.join(process.cwd(), 'public', 'conga', 'index.html'), 'utf8');
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

export async function GET() {
  const page = process.env.NODE_ENV === 'production' ? (kept ??= read()) : read();
  const viewer = await campusViewer();
  const [player, board] = await Promise.all([viewer ? congaPlayer(db(), viewer) : null, congaBoards(db(), viewer?.personId ?? null).catch(() => null)]);
  const told = `<script>window.congaPlayer = ${json(player)}; window.congaBoard = ${json(board)};</script>\n`;
  return new Response((await page).replace('<head>', '<head>\n<base href="/" target="_top">').replace('<script type="module">', `${told}<script type="module">`),
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' } });
}
