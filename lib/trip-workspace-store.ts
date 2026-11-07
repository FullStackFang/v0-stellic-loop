import { legacyWorkspaceAllowed } from "./emba/legacy";
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { Db, Q } from './db';
import { emptyTripDraft, type TripDraft, type TripWorkspace } from './trip-draft';

export const hashEditToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newEditToken = () => randomBytes(32).toString('base64url');
export async function workspace(q: Q, id: string, token?: string): Promise<TripWorkspace | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !token || !await legacyWorkspaceAllowed(q, id)) return null;
  const { rows } = await q.query<TripWorkspace>(`select w.id, b.slug, w.writer, w.draft, w.pins, w.revision
    from trip_workspace w left join board b on b.id=w.board_id
    where w.id=$1 and w.edit_secret_hash=$2`, [id, hashEditToken(token)]);
  return rows[0] ?? null;
}
export async function createWorkspace(q: Q) {
  const token = newEditToken();
  const { rows: [row] } = await q.query<{ id: string }>('insert into trip_workspace (edit_secret_hash, draft) values ($1,$2) returning id', [hashEditToken(token), JSON.stringify(emptyTripDraft())]);
  return { id: row.id, token };
}
export async function saveWorkspace(q: Db, id: string, token: string, writer: string, draft: TripDraft, pins: Record<string, string>, revision: number) {
  return q.tx(async tx => {
    if (!await legacyWorkspaceAllowed(tx, id)) return false;
    const { rows } = await tx.query<{ revision: number }>(`update trip_workspace set writer=$3,draft=$4,pins=$5,revision=$6,updated_at=now()
      where id=$1 and edit_secret_hash=$2 and revision < $6 returning revision`,
      [id, hashEditToken(token), writer.slice(0, 40000), JSON.stringify(draft), JSON.stringify(pins), revision]);
    if (!rows[0]) return false;
    await tx.query('delete from trip_place where workspace_id=$1', [id]);
    await tx.query('delete from trip_optional where workspace_id=$1', [id]);
    for (const [position, place] of draft.places.entries()) await tx.query(
      'insert into trip_place (id,workspace_id,position,name,from_day,to_day,hotel) values ($1,$2,$3,$4,$5,$6,$7)',
      [place.id, id, position, place.name, place.from, place.to, place.hotel]);
    for (const [position, item] of draft.optional.entries()) await tx.query(
      'insert into trip_optional (id,workspace_id,position,label,date_text,cost,minimum,deadline) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [item.id, id, position, item.label, item.date, item.cost, item.min, item.deadline]);
    const { rows: [published] } = await tx.query<{ board_id: string | null }>('select board_id from trip_workspace where id=$1', [id]);
    if (published?.board_id) {
      const start = /^\d{4}-\d{2}-\d{2}$/.test(draft.start) ? draft.start : null;
      const end = /^\d{4}-\d{2}-\d{2}$/.test(draft.end) && (!start || draft.end >= start) ? draft.end : null;
      await tx.query('update board set name=$2,tz=$3 where id=$1', [published.board_id, draft.name.trim().slice(0, 60) || 'Untitled trip', draft.timezone || 'America/New_York']);
      await tx.query('update trip set destination=$2,start_day=$3,end_day=$4 where board_id=$1', [published.board_id, draft.places[0]?.name ?? '', start, end]);
    }
    return true;
  });
}
