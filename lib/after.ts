// Notifier hand-offs that run after the transaction commits.
import "server-only";
import { db } from "./db";
import { effectiveDays } from "./quorum";
import { conflictsFor } from "./quorum";
import { notifier } from "./notify";
import { appUrl } from "./url";
import type { Proposal, Response } from "./types";

/** An `in` left an ON proposal: the poster is told, nobody else. */
export async function notifyDropped(p: Proposal, who: string, count: number) {
  if (!p.poster_id || p.poster_id === who) return;
  await notifier(db()).dropped({
    boardId: p.board_id, proposalId: p.id, title: p.title, url: appUrl(`/p/${p.id}`),
    to: p.poster_id, who, count,
  });
}

/** The ON message, once, with yeses, maybes and the yeses whose days missed the locked day. */
export async function notifyReached(proposalId: string) {
  const q = db();
  const { rows: [p] } = await q.query<Proposal>("select * from proposal where id = $1", [proposalId]);
  const { rows: rs } = await q.query<Response>(
    "select r.* from response r join proposal p on p.id = r.proposal_id where p.board_id = $1", [p.board_id]);
  const { rows: ps } = await q.query<Proposal>("select * from proposal where board_id = $1", [p.board_id]);
  const conflicts = conflictsFor(ps, rs);
  const mine = rs.filter((r) => r.proposal_id === p.id);
  const yeses = mine.filter((r) => r.answer === "in");
  await notifier(q).onReached({
    boardId: p.board_id,
    proposalId: p.id,
    title: p.title,
    url: appUrl(`/p/${p.id}`),
    onDay: p.on_day,
    timeText: p.time_text,
    lockedBy: p.locked_by!,
    yeses: yeses.map((r) => r.person_id),
    cantMakeIt: p.on_day ? yeses.filter((r) => !effectiveDays(r, conflicts).includes(p.on_day!)).map((r) => r.person_id) : [],
    maybes: mine.filter((r) => r.answer === "maybe").map((r) => r.person_id),
  });
}
