import { db } from '@/lib/db';
import { pollView } from '@/lib/when/polls';
import { pollIcs } from '@/lib/when/send';

// "Add to my calendar": the poll's hour as a calendar file, once the time is set. It names no one, and anyone with the poll's address may have it.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const view = await pollView(db(), null, (await params).id), file = view && pollIcs(view);
    if (!file) return new Response('Not found', { status: 404, headers });
    return new Response(file, { headers: { ...headers, 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="loopd.ics"' } });
  } catch {
    return new Response('Unavailable', { status: 503, headers });
  }
}
