import { notFound } from "next/navigation";
import { PostForm, type PostPrefill } from "@/components/PostForm";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { boardBySlug, proposalById } from "@/lib/load";
import { countedDays, todayIn } from "@/lib/days";
import { isIdled } from "@/lib/quorum";
import { viewer } from "@/lib/viewer";

export default async function NewPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ again?: string }> }) {
  const q = db();
  const board = await boardBySlug(q, (await params).slug);
  if (!board) notFound();
  const { again } = await searchParams;
  const [orig, me] = await Promise.all([again ? proposalById(q, again) : null, viewer(q)]);
  const prefill: PostPrefill | null =
    orig && orig.board_id === board.id && isIdled(orig, board)
      ? { versionOf: orig.id, title: orig.title, day: orig.day ?? orig.on_day ?? null, time: orig.time_text, place: orig.place ?? null }
      : null;
  return (
    <Shell board={board} tab="new">
      <PostForm slug={board.slug} signedIn={!!me} from={prefill} days={countedDays(board, todayIn(board.tz))} />
    </Shell>
  );
}
