import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { readFeeds } from '@/lib/campus/import';

// Every hour: read each campus calendar feed that is on. A feed that fails is recorded on the feed and does not stop the others.
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(request.headers.get('authorization') ?? ''), expected = Buffer.from(`Bearer ${secret ?? ''}`);
  const headers = { 'Cache-Control': 'no-store' };
  if (!secret || provided.length !== expected.length || !timingSafeEqual(provided, expected)) return new Response('Unauthorized', { status: 401, headers });
  try {
    return Response.json(await readFeeds(db()), { headers });
  } catch {
    return Response.json({ error: 'Feeds unavailable' }, { status: 503, headers });
  }
}
