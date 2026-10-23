import { db } from "@/lib/db";
import { boardBySlug } from "@/lib/load";
import { boardImage, OG_SIZE } from "@/lib/og";

export const alt = "Quorum board";
export const size = OG_SIZE;
export const contentType = "image/png";

/** The board's preview: its name, no counts, so a stale cache is harmless. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const board = await boardBySlug(db(), (await params).slug);
  return boardImage(board?.name ?? "Quorum");
}
