import { db } from "@/lib/db";
import { inviteIcs } from "@/lib/ics";
import { proposalById } from "@/lib/load";
import { appUrl } from "@/lib/url";

/** One all-day event for an ON proposal with a day; not found for anything else. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await proposalById(db(), id);
  if (!p || p.status !== "on" || !p.on_day) return new Response("Not found", { status: 404 });
  const body = inviteIcs({ id: p.id, title: p.title, day: p.on_day, timeText: p.time_text, costText: p.cost_text, url: appUrl(`/p/${p.id}`) });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="invite.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
