import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { congaPlayer } from '@/lib/campus/conga';
import { campusViewer } from '@/lib/campus/session';

// The Conga game's page (public/conga/index.html, a plain page with its scripts beside it), with who is playing
// written into it as `congaPlayer`: null for someone signed out, who plays as before. It is a page and not a request
// the game makes afterwards, because only a page being opened renews a sign-in that has gone stale (proxy.ts reads the
// sign-in for /conga).
// The page is not inside the app, so it says itself that it was opened (app/c/seen, for the admin's Activity section): on the live site only.
const SEEN = process.env.NODE_ENV === 'production' ? `<script>fetch('/c/seen', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: '/conga' }) }).catch(() => {});</script>\n` : '';
// Vercel Web Analytics counts it the same way (components/analytics.tsx): its script, as a plain page carries it.
const COUNTED = process.env.NODE_ENV === 'production' ? `<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>\n<script defer src="/_vercel/insights/script.js"></script>\n` : '';
// Read once where the page cannot change under the server, and afresh while it is being worked on.
let kept: Promise<string> | undefined;
const read = () => readFile(path.join(process.cwd(), 'public', 'conga', 'index.html'), 'utf8');

export async function GET() {
  const page = process.env.NODE_ENV === 'production' ? (kept ??= read()) : read();
  const viewer = await campusViewer();
  const player = JSON.stringify(viewer ? await congaPlayer(db(), viewer) : null).replace(/</g, '\u003c');
  return new Response((await page).replace('<script type="module">', `<script>window.congaPlayer = ${player};</script>\n${SEEN}${COUNTED}<script type="module">`), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' } });
}
