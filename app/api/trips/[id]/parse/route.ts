import { db } from '@/lib/db';
import { workspace } from '@/lib/trip-workspace-store';
import { extractTrip } from '@/lib/trip-extraction';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, q = db(), token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!await workspace(q, id, token)) return Response.json({ error: 'Not found.' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const writer = typeof body?.writer === 'string' ? body.writer.slice(0, 40000) : '';
  const { rows } = await q.query<{ id: string; extracted_text: string }>('select id, extracted_text from trip_document where workspace_id=$1 order by created_at', [id]);
  const draft = await extractTrip(writer, rows.map(r => ({ id: r.id, text: r.extracted_text })));
  return Response.json({ draft });
}
