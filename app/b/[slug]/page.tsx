import { notFound } from "next/navigation";
import { SpaceView } from "@/components/SpaceView";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { boardBySlug, boardData } from "@/lib/load";
import { sortBoard } from "@/lib/quorum";
import { planModel } from "@/lib/view";
import { forecast } from "@/lib/forecast";
import { viewer } from "@/lib/viewer";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const board = await boardBySlug(db(), (await params).slug);
  const robots = { index: false, follow: false };
  return board ? { title: `${board.name} · Loop`, openGraph: { title: board.name }, robots } : { robots };
}

export default async function BoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const q = db();
  const board = await boardBySlug(q, (await params).slug);
  if (!board) notFound();
  const [data, who] = await Promise.all([boardData(q, board), viewer(q)]);
  const me = who;
  const { rows: [{ n: members }] } = await q.query<{n:number}>("select count(*)::int n from board_person where board_id = $1", [board.id]);
  const now = new Date();
  const items = data.proposals.map((p) => ({ proposal: p, responses: data.responses.filter((r) => r.proposal_id === p.id) }));
  const sorted = sortBoard(items, board, data.conflicts, now);
  const model = (it: (typeof items)[number]) => planModel(it.proposal, data, me, now);
  const lit = async (items: typeof sorted.open) => Promise.all(items.map(async it => { const c = model(it); return {...c,...await forecast(board,c.day)}; }));
  const [open, formed, wrapped] = await Promise.all([lit(sorted.open),lit(sorted.on),lit(sorted.past)]);
  return (
    <Shell board={board} tab="board">
      <SpaceView board={board} open={open} formed={formed} wrapped={wrapped} members={members} />
    </Shell>
  );
}
