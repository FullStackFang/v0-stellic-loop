import { db } from '@/lib/db';
import { limited } from '@/lib/ratelimit';
import { createWorkspace } from '@/lib/trip-workspace-store';
export async function POST() {
  if (await limited('board')) return Response.json({ error: 'Please try again later.' }, { status: 429 });
  return Response.json(await createWorkspace(db()));
}
