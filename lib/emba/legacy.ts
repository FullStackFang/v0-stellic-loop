import 'server-only';
import type { Q } from '../db';

// Legacy cookies, edit secrets and share links never authorize pilot records.
// Do not cache these checks: classification can change between requests.
export async function legacyBoardAllowed(q: Q, id: string): Promise<boolean> {
  const { rows } = await q.query(`select 1 from board b where b.id::text=$1
    and b.pilot_loop_id is null and not exists
    (select 1 from trip_workspace w where w.board_id=b.id and w.pilot_loop_id is not null)`, [id]);
  return rows.length > 0;
}

export async function legacyWorkspaceAllowed(q: Q, id: string): Promise<boolean> {
  const { rows } = await q.query<{ board_id: string | null }>(
    'select board_id from trip_workspace where id::text=$1 and pilot_loop_id is null', [id]);
  return !!rows[0] && (!rows[0].board_id || await legacyBoardAllowed(q, rows[0].board_id));
}

export async function legacyProposalAllowed(q: Q, id: string): Promise<boolean> {
  const { rows } = await q.query<{ board_id: string }>('select board_id from proposal where id::text=$1', [id]);
  return !!rows[0] && await legacyBoardAllowed(q, rows[0].board_id);
}

export async function requireLegacyBoard(q: Q, id: string): Promise<void> {
  if (!await legacyBoardAllowed(q, id)) throw new Error('not_found');
}

export async function requireLegacyProposal(q: Q, id: string): Promise<void> {
  if (!await legacyProposalAllowed(q, id)) throw new Error('not_found');
}

/** Magic-link destinations must not disclose a classified slug or proposal. */
export async function legacyPathAllowed(q: Q, path: string): Promise<boolean> {
  const parts = path.split(/[?#]/, 1)[0].split('/');
  if (parts[1] === 'p' && parts[2]) {
    const { rows } = await q.query<{ board_id: string }>('select board_id from proposal where id::text=$1', [parts[2]]);
    return !rows[0] || await legacyBoardAllowed(q, rows[0].board_id);
  }
  if (['b', 'trip'].includes(parts[1]) && parts[2]) {
    const { rows } = await q.query<{ id: string }>('select id from board where slug=$1', [parts[2]]);
    return !rows[0] || await legacyBoardAllowed(q, rows[0].id);
  }
  return true;
}
