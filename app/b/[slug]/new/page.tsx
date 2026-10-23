import { notFound } from "next/navigation";
import { PostForm, type PostPrefill } from "@/components/PostForm";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { boardBySlug, proposalById } from "@/lib/load";
import { viewer } from "@/lib/viewer";

export default async function NewPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string }> }) {
  const q = db();
  const board = await boardBySlug(q, (await params).slug);
  if (!board) notFound();
  const { from } = await searchParams;
  const [orig, me] = await Promise.all([from ? proposalById(q, from) : null, viewer(q)]);
  const prefill: PostPrefill | null =
    orig && orig.board_id === board.id
      ? { versionOf: orig.id, title: orig.title, icon: orig.icon, detail: orig.detail, cost: orig.cost_text, time: orig.time_text, min: orig.min_count, needsDay: orig.needs_day }
      : null;
  return (
    <Shell board={board} tab="new">
      <PostForm slug={board.slug} signedIn={!!me} from={prefill} />
    </Shell>
  );
}
