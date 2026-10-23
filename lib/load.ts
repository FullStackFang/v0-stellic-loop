// Reads shared by pages and actions.
import type { Q } from "./db";
import { conflictsFor, type Conflicts } from "./quorum";
import type { Board, Detail, Person, Proposal, Response } from "./types";

const BOARD_COLS = "id, slug, name, tz, window_start, window_end";

export async function boardBySlug(q: Q, slug: string): Promise<Board | null> {
  const { rows } = await q.query<Board>(`select ${BOARD_COLS} from board where slug = $1`, [slug]);
  return rows[0] ?? null;
}

export async function boardById(q: Q, id: string): Promise<Board | null> {
  const { rows } = await q.query<Board>(`select ${BOARD_COLS} from board where id = $1`, [id]);
  return rows[0] ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

export async function proposalById(q: Q, id: string, forUpdate = false): Promise<Proposal | null> {
  if (!isUuid(id)) return null;
  const { rows } = await q.query<Proposal>(`select * from proposal where id = $1${forUpdate ? " for update" : ""}`, [id]);
  return rows[0] ?? null;
}

export async function responsesFor(q: Q, proposalId: string): Promise<Response[]> {
  const { rows } = await q.query<Response>("select * from response where proposal_id = $1 order by updated_at", [proposalId]);
  return rows;
}

export async function personById(q: Q, id: string): Promise<Person | null> {
  if (!isUuid(id)) return null;
  const { rows } = await q.query<Person>("select id, phone, name, show_name, sms_opt_out from person where id = $1", [id]);
  return rows[0] ?? null;
}

export async function freeDays(q: Q, boardId: string, personId: string): Promise<string[]> {
  const { rows } = await q.query<{ day: string }>(
    "select day from free_day where board_id = $1 and person_id = $2 order by day",
    [boardId, personId],
  );
  return rows.map((r) => r.day);
}

/** Days this person is ON for on the board, keyed day → ON proposal. */
export async function personConflicts(q: Q, boardId: string, personId: string): Promise<Map<string, Proposal>> {
  const { rows } = await q.query<Proposal>(
    `select p.* from proposal p join response r on r.proposal_id = p.id
     where p.board_id = $1 and r.person_id = $2 and r.answer = 'in' and p.status = 'on' and p.on_day is not null
     order by p.on_at`,
    [boardId, personId],
  );
  const out = new Map<string, Proposal>();
  for (const p of rows) if (!out.has(p.on_day!)) out.set(p.on_day!, p);
  return out;
}

export type BoardData = {
  board: Board;
  proposals: Proposal[];
  responses: Response[];
  people: Map<string, Pick<Person, "id" | "name" | "show_name">>;
  conflicts: Conflicts;
};

/** Everything a board or proposal page renders from. */
export async function boardData(q: Q, board: Board): Promise<BoardData> {
  const [{ rows: proposals }, { rows: responses }, { rows: people }] = await Promise.all([
    q.query<Proposal>("select * from proposal where board_id = $1", [board.id]),
    q.query<Response>(
      "select r.* from response r join proposal p on p.id = r.proposal_id where p.board_id = $1 order by r.updated_at",
      [board.id],
    ),
    q.query<Pick<Person, "id" | "name" | "show_name">>(
      `select distinct pe.id, pe.name, pe.show_name from person pe
       where pe.id in (select r.person_id from response r join proposal p on p.id = r.proposal_id where p.board_id = $1)
          or pe.id in (select poster_id from proposal where board_id = $1)
          or pe.id in (select locked_by from proposal where board_id = $1)
          or pe.id in (select d.added_by from proposal_detail d join proposal p on p.id = d.proposal_id where p.board_id = $1)`,
      [board.id],
    ),
  ]);
  return { board, proposals, responses, people: new Map(people.map((p) => [p.id, p])), conflicts: conflictsFor(proposals, responses) };
}

export async function detailsFor(q: Q, proposalId: string): Promise<Detail[]> {
  const { rows } = await q.query<Detail>("select * from proposal_detail where proposal_id = $1 order by added_at, id", [proposalId]);
  return rows;
}
