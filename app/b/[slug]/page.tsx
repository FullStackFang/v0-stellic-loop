import { notFound } from "next/navigation";
import { BoardView } from "@/components/BoardView";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { boardBySlug, boardData, freeDays } from "@/lib/load";
import { sortBoard } from "@/lib/quorum";
import { cardModel } from "@/lib/view";
import { viewer } from "@/lib/viewer";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const board = await boardBySlug(db(), (await params).slug);
  const robots = { index: false, follow: false };
  return board ? { title: `${board.name} · Quorum`, openGraph: { title: board.name }, robots } : { robots };
}

export default async function BoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const q = db();
  const board = await boardBySlug(q, (await params).slug);
  if (!board) notFound();
  const [data, who] = await Promise.all([boardData(q, board), viewer(q)]);
  const me = who && { ...who, free: await freeDays(q, board.id, who.id) };
  const now = new Date();
  const items = data.proposals.map((p) => ({ proposal: p, responses: data.responses.filter((r) => r.proposal_id === p.id) }));
  const sorted = sortBoard(items, board, data.conflicts, now);
  const model = (it: (typeof items)[number]) => cardModel(it.proposal, data, me, now);
  return (
    <Shell board={board} tab="board">
      <BoardView board={board} open={sorted.open.map(model)} on={sorted.on.map(model)} past={sorted.past.map(model)} signedIn={!!me} />
    </Shell>
  );
}
