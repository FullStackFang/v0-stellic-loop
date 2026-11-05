import { db } from '@/lib/db';
import { viewer } from '@/lib/viewer';
import { boardBySlug } from '@/lib/load';
import { getTrip } from '@/lib/trip-store';
import { joinBoard } from '@/lib/identity';
import { revalidatePath } from 'next/cache';
const MAX = 3 * 1024 * 1024;
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, q = db(), me = await viewer(q);
  if (!me) return Response.json({ error: 'Sign in to upload a document.' }, { status: 401 });
  const board = await boardBySlug(q, slug);
  if (!board || !await getTrip(q, board.id)) return Response.json({ error: 'Trip not found.' }, { status: 404 });
  if (Number(request.headers.get('content-length')) > MAX + 65536) return Response.json({ error: 'Choose a file under 3 MB.' }, { status: 413 });
  const form = await request.formData(), file = form.get('file');
  if (!(file instanceof File) || !file.size || file.size > MAX) return Response.json({ error: 'Choose a file under 3 MB.' }, { status: 400 });
  if (!['application/pdf', 'image/jpeg', 'image/png', 'text/plain'].includes(file.type)) return Response.json({ error: 'Choose a PDF, JPG, PNG, or text file.' }, { status: 400 });
  const title = String(form.get('title') ?? '').trim().slice(0, 120) || file.name.slice(0, 120);
  await q.tx(async tx => {
    await tx.query("insert into trip_item (board_id,owner_id,kind,title,shared,filename,mime,file_data) values ($1,$2,'document',$3,$4,$5,$6,decode($7,'base64'))", [board.id, me.id, title, form.get('shared') === 'on', file.name.slice(0, 200), file.type, Buffer.from(await file.arrayBuffer()).toString('base64')]);
    await joinBoard(tx, board.id, me.id, null, { source: 'direct', shareId: null });
  });
  revalidatePath(`/trip/${slug}`);
  return Response.json({ ok: true });
}

