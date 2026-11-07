import { legacyBoardAllowed, requireLegacyBoard } from "./emba/legacy";
import 'server-only';
import type { Q } from './db';
import type { Trip, TripItem } from './trip';
import { createBoardAs } from './ops';
import { boardBySlug } from './load';
export async function createTripAs(q: Q, personId: string, name: string, tz: string) {
  const result = await createBoardAs(q, personId, name, tz);
  if (result.status !== 'ok') return result;
  const board = (await boardBySlug(q, result.slug))!;
  await q.query('insert into trip (board_id, owner_id) values ($1, $2)', [board.id, personId]);
  return result;
}
export async function getTrip(q: Q, boardId: string) {
  if (!await legacyBoardAllowed(q, boardId)) return null;
  const { rows } = await q.query<Trip>('select * from trip where board_id = $1', [boardId]);
  return rows[0] ?? null;
}
export async function tripItems(q: Q, boardId: string, personId: string | null) {
  await requireLegacyBoard(q, boardId);
  const { rows } = await q.query<TripItem>(`select i.id, i.owner_id, i.kind, i.title, i.day, i.time, i.location, i.notes, i.shared, i.filename,
    case when p.show_name or p.id = $2 then p.name else 'Cohort member' end as owner,
    (select count(*)::int from trip_rsvp r where r.item_id = i.id) as count,
    exists(select 1 from trip_rsvp r where r.item_id = i.id and r.person_id = $2) as joined
    from trip_item i join person p on p.id = i.owner_id
    where i.board_id = $1 and (i.shared or i.owner_id = $2)
    order by i.day nulls last, i.time, i.created_at`, [boardId, personId]);
  return rows;
}
