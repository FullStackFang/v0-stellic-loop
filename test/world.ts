// Small builders for action tests.
import type { Q } from "@/lib/db";
import { makeBoard, makePerson } from "./db";

export const D = { sun: "2099-02-14", mon: "2099-02-15", tue: "2099-02-16", wed: "2099-02-17", thu: "2099-02-18", fri: "2099-02-19", sat: "2099-02-20" };

export async function world(q: Q) {
  const board = await makeBoard(q);
  return {
    board,
    async person(name = "P", over: { show_name?: boolean } = {}) {
      const p = await makePerson(q, name, over);
      await q.query("insert into board_person (board_id, person_id, joined_via) values ($1, $2, 'seed')", [board.id, p.id]);
      return p;
    },
    async proposal(posterId: string | null, over: Record<string, unknown> = {}) {
      const cols = { board_id: board.id, poster_id: posterId, title: "Suits in Hoi An", ...over };
      const keys = Object.keys(cols);
      const { rows } = await q.query<{ id: string }>(
        `insert into proposal (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
        Object.values(cols),
      );
      return rows[0].id;
    },
    async answer(proposalId: string, personId: string, answer: "in" | "out" | "maybe", days: string[] = []) {
      await q.query("insert into response (proposal_id, person_id, answer, days) values ($1, $2, $3, $4)", [proposalId, personId, answer, days]);
    },
    async free(personId: string, days: string[]) {
      for (const d of days) await q.query("insert into free_day (board_id, person_id, day) values ($1, $2, $3)", [board.id, personId, d]);
    },
  };
}

export async function responseOf(q: Q, proposalId: string, personId: string) {
  const { rows } = await q.query<{ answer: string; days: string[] }>(
    "select answer, days from response where proposal_id = $1 and person_id = $2", [proposalId, personId]);
  return rows[0] ?? null;
}

export async function events(q: Q, type: string, proposalId?: string) {
  const { rows } = await q.query<{ person_id: string; source: string; share_id: string | null; data: Record<string, unknown> }>(
    `select person_id, source, share_id, data from event where type = $1 ${proposalId ? "and proposal_id = $2" : ""} order by at, id`,
    proposalId ? [type, proposalId] : [type],
  );
  return rows;
}
