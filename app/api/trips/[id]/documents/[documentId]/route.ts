import { legacyWorkspaceAllowed } from "@/lib/emba/legacy";
import { db } from '@/lib/db';
import { workspace } from '@/lib/trip-workspace-store';
export async function GET(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params, q = db();
  if (!await legacyWorkspaceAllowed(q, id)) return new Response('Not found', { status: 404 });
  const { rows: [doc] } = await q.query<{ name: string; mime: string; file_data: Buffer; board_id: string | null }>(
    `select d.name,d.mime,d.file_data,w.board_id from trip_document d join trip_workspace w on w.id=d.workspace_id
     where d.id=$1 and w.id=$2`, [documentId, id]);
  if (!doc) return new Response('Not found', { status: 404 });
  if (!doc.board_id && !await workspace(q, id, request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '')) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(doc.file_data), { headers: {
    'Content-Type': doc.mime, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}
