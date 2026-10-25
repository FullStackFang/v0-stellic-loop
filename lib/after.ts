// Notifier hand-offs that run after the transaction commits. Each swallows its
// own errors: the action has already succeeded, and a text is never retried.
import "server-only";
import { db } from "./db";
import { effectiveDays } from "./quorum";
import { conflictsFor, minOf } from "./quorum";
import { notifier } from "./notify";
import { mintShare } from "./ops";
import { appUrl } from "./url";
import type { Proposal, Response } from "./types";

async function quietly(what: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error(JSON.stringify({ after: what, error: String(e) }));
  }
}

/** An `in` left an ON proposal: the poster is told, nobody else. */
export async function notifyDropped(p: Proposal, who: string, count: number) {
  if (!p.poster_id || p.poster_id === who) return;
  const to = p.poster_id;
  await quietly("dropped", () => notifier(db()).dropped({
    boardId: p.board_id, proposalId: p.id, title: p.title, url: appUrl(`/p/${p.id}`),
    to, who, count,
  }));
}

/** The ON message, once, with yeses, maybes and the yeses whose days missed the locked day. */
export function notifyReached(proposalId: string) {
  return quietly("reached", async () => {
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
  });
}

/** Two short: the poster and every yes get a share link of their own to send on. */
export function notifyOneMore(p: Proposal, count: number) {
  return quietly("one_more", async () => {
    const to = await db().tx(async (q) => {
      const { rows } = await q.query<{ person_id: string }>(
        "select person_id from response where proposal_id = $1 and answer = 'in'", [p.id]);
      const ids = new Set(rows.map((r) => r.person_id));
      if (p.poster_id) ids.add(p.poster_id);
      const out: { personId: string; url: string }[] = [];
      for (const id of ids) out.push({ personId: id, url: appUrl(await mintShare(q, p, id)) });
      return out;
    });
    await notifier(db()).oneMore({
      boardId: p.board_id, proposalId: p.id, title: p.title, url: appUrl(`/p/${p.id}`),
      to, count, min: minOf(p),
    });
  });
}
