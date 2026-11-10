import { db } from '@/lib/db';
import { viewer } from '@/lib/viewer';
import { boardBySlug, isUuid } from '@/lib/load';
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) return new Response('Not found', { status: 404 });
  const q = db(), me = await viewer(q);
  if (!await boardBySlug(q, slug)) return new Response('Not found', { status: 404 });
  const { rows } = await q.query<{ filename: string; file_data: Buffer }>(`select i.filename, i.file_data from trip_item i join board b on b.id=i.board_id
    where i.id=$1 and b.slug=$2 and i.file_data is not null and (i.shared or i.owner_id=$3)`, [id, slug, me?.id ?? null]);
  if (!rows[0]) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(rows[0].file_data), { headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(rows[0].filename)}`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}
