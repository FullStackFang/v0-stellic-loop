import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { isIdled } from "@/lib/quorum";
import type { Board, Proposal } from "@/lib/types";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Writes `proposal_idled` once for every open proposal past its idle day.
 * Idling itself is computed at read time; this only stamps when. Never sends anything.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const q = db();
  const { rows: boards } = await q.query<Board>("select id, slug, name, tz, window_start, window_end from board");
  let idled = 0;
  for (const board of boards) {
    const { rows } = await q.query<Proposal>("select * from proposal where board_id = $1 and status = 'open'", [board.id]);
    for (const p of rows.filter((p) => isIdled(p, board))) {
      const r = await q.query(
        `insert into event (board_id, proposal_id, type, source, data)
         values ($1, $2, 'proposal_idled', 'direct', $3)
         on conflict (proposal_id) where type = 'proposal_idled' do nothing
         returning id`,
        [board.id, p.id, JSON.stringify({ min: p.min_count ?? 4 })],
      );
      idled += r.rows.length;
    }
  }
  return Response.json({ idled });
}
