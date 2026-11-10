import { legacyWorkspaceAllowed } from "@/lib/emba/legacy";
import { db } from '@/lib/db';
import { hashEditToken, workspace, saveWorkspace } from '@/lib/trip-workspace-store';
import { emptyTripDraft, type TripDraft } from '@/lib/trip-draft';
import { allocateBoard, slugify } from '@/lib/slug';
import { boardTz } from '@/lib/ops';

const tokenOf = (request: Request) => request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
const bad = () => Response.json({ error: 'Trip draft not found.' }, { status: 404 });
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await workspace(db(), id, tokenOf(request));
  if (!found) return bad();
  const { rows: documents } = await db().query<{ id: string; name: string; pages: number }>('select id,name,pages from trip_document where workspace_id=$1 order by created_at', [id]);
  return Response.json({ ...found, draft: { ...found.draft, documents } });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, token = tokenOf(request), q = db();
  if (!await workspace(q, id, token)) return bad();
  const data = await request.json().catch(() => null) as { writer?: unknown; draft?: TripDraft; pins?: Record<string, string>; revision?: number } | null;
  if (!data || typeof data.writer !== 'string' || data.writer.length > 40000 || !data.draft || typeof data.draft !== 'object' ||
      !data.pins || typeof data.pins !== 'object' || !Number.isSafeInteger(data.revision) || (data.revision ?? 0) < 1) return Response.json({ error: 'Invalid draft.' }, { status: 400 });
  const draft = { ...emptyTripDraft(), ...data.draft, documents: [] };
  const saved = await saveWorkspace(q, id, token, data.writer, draft, data.pins, data.revision!);
  return Response.json({ saved, revision: data.revision });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, q = db(), token = tokenOf(request);
  if (!await workspace(q, id, token)) return bad();
  const out = await q.tx(async tx => {
    if (!await legacyWorkspaceAllowed(tx, id)) return null;
    const { rows: [w] } = await tx.query<{ board_id: string | null; draft: TripDraft }>(
      'select board_id,draft from trip_workspace where id=$1 and edit_secret_hash=$2 for update', [id, hashEditToken(token)]);
    if (!w) return null;
    if (w.board_id) {
      const { rows: [board] } = await tx.query<{ slug: string }>('select slug from board where id=$1', [w.board_id]);
      return board?.slug ?? null;
    }
    const draft = w.draft;
    const name = draft.name.trim().slice(0, 60) || 'Untitled trip';
    const board = await allocateBoard(tx, slugify(name), { name, tz: boardTz(draft.timezone) });
    const start = /^\d{4}-\d{2}-\d{2}$/.test(draft.start) ? draft.start : null;
    const end = /^\d{4}-\d{2}-\d{2}$/.test(draft.end) && (!start || draft.end >= start) ? draft.end : null;
    await tx.query('insert into trip (board_id,destination,start_day,end_day) values ($1,$2,$3,$4)', [board.id, draft.places[0]?.name ?? '', start, end]);
    await tx.query('update trip_workspace set board_id=$2 where id=$1', [id, board.id]);
    return board.slug;
  });
  return out ? Response.json({ slug: out }) : bad();
}
