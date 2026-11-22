import { db } from '@/lib/db';
import { stopReminders } from '@/lib/when/outbox';

// The stop link in every Loopd When email. Opening it shows one button, so a mail program that follows links to
// check them stops nothing. Pressing the button, or the mail program's own "unsubscribe" (RFC 8058, a POST with no
// sign-in), stops emails about that one poll for that one person.
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' };
const page = (body: string) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Loopd When</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#f1f3f5;color:#2b1a17;font:16px/1.45 system-ui,sans-serif"><main style="max-width:360px;margin:24px;padding:22px;background:#fdfdf8;border:1.5px solid #2b1a17;border-radius:22px 22px 22px 6px">${body}</main></body></html>`;
const button = 'font:inherit;font-weight:700;color:#fdfdf8;background:#b31b1b;border:1.5px solid #2b1a17;border-radius:99px;padding:12px 20px;cursor:pointer';

export async function GET() {
  return new Response(page(`<h1 style="margin:0 0 8px;font-size:22px">Stop emails about this poll?</h1><p style="margin:0 0 16px">You can still open the poll and answer it.</p><form method="post"><button style="${button}">Stop the emails</button></form>`), { headers });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const stopped = await stopReminders(db(), (await params).token), wantsPage = (request.headers.get('accept') ?? '').includes('text/html');
    if (!stopped) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return wantsPage ? new Response(page('<h1 style="margin:0 0 8px;font-size:22px">Stopped.</h1><p style="margin:0">No more emails about this poll.</p>'), { headers }) : new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
