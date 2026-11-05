import { db } from '@/lib/db';
import { workspace } from '@/lib/trip-workspace-store';
import { transcribeDocument } from '@/lib/trip-extraction';
const MAX = 3 * 1024 * 1024;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, q = db(), token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!await workspace(q, id, token)) return Response.json({ error: 'Trip draft not found.' }, { status: 404 });
  if (Number(request.headers.get('content-length')) > MAX + 65536) return Response.json({ error: 'Choose a file under 3 MB.' }, { status: 413 });
  const form = await request.formData(), file = form.get('file');
  if (!(file instanceof File) || !file.size || file.size > MAX) return Response.json({ error: 'Choose a file under 3 MB.' }, { status: 400 });
  if (!['application/pdf', 'image/jpeg', 'image/png', 'text/plain'].includes(file.type)) return Response.json({ error: 'Choose a PDF, JPG, PNG, or text file.' }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const extracted = await transcribeDocument(bytes, file.type, file.name);
  const { rows: [doc] } = await q.query<{ id: string }>(
    `insert into trip_document (workspace_id,name,mime,file_data,extracted_text,pages) values ($1,$2,$3,decode($4,'base64'),$5,$6) returning id`,
    [id, file.name.slice(0, 200), file.type, bytes.toString('base64'), extracted?.text ?? '', extracted?.pages ?? 0]);
  return Response.json({ document: { id: doc.id, name: file.name.slice(0, 200), pages: extracted?.pages ?? 0 } });
}
