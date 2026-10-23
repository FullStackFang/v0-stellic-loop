import { shortLabel } from "@/lib/days";
import { db } from "@/lib/db";
import { boardById, boardData, proposalById } from "@/lib/load";
import { proposalImage } from "@/lib/og";
import { cardModel, countLine } from "@/lib/view";

/** The unfurl, exact at the moment it's fetched: title, count line, best or locked day, board name. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = db();
  const p = await proposalById(q, id);
  if (!p) return new Response("Not found", { status: 404 });
  const board = (await boardById(q, p.board_id))!;
  const c = cardModel(p, await boardData(q, board), null);
  const on = c.state === "on" || (c.state === "past" && p.status === "on");
  const day = c.onDay ?? (c.needsDay ? c.bestDay : null);
  const big = on ? "On" : c.needsDay ? (day ? `${c.bestCount} can do ${shortLabel(day).split(" ")[0]}` : "No days yet") : `${c.inCount} in`;
  return proposalImage(
    { title: p.title, icon: p.icon, big, line: countLine(c).replace(` · ${p.title}`, ""), board: board.name, on },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
