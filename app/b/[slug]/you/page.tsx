import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { YouView } from "@/components/YouView";
import { db } from "@/lib/db";
import { boardBySlug, boardData, freeDays } from "@/lib/load";
import { cardModel } from "@/lib/view";
import { viewer } from "@/lib/viewer";

export default async function YouPage({ params }: { params: Promise<{ slug: string }> }) {
  const q = db();
  const board = await boardBySlug(q, (await params).slug);
  if (!board) notFound();
  const me = await viewer(q);
  if (!me) {
    return <Shell board={board} tab="you"><YouView board={board} me={null} free={[]} mine={[]} /></Shell>;
  }
  const [data, free] = await Promise.all([boardData(q, board), freeDays(q, board.id, me.id)]);
  const mine = data.proposals
    .map((p) => cardModel(p, data, me))
    .filter((c) => c.me === "in" && (c.state === "open" || c.state === "ready" || c.state === "on"))
    .sort((a, b) => (a.state === "on" ? 1 : 0) - (b.state === "on" ? 1 : 0));
  return (
    <Shell board={board} tab="you">
      <YouView board={board} me={me} free={free} mine={mine} />
    </Shell>
  );
}
