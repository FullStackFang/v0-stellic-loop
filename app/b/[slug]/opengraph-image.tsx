import { db } from "@/lib/db";
import { boardBySlug } from "@/lib/load";
import { boardImage, OG_SIZE } from "@/lib/og";

export const alt = "Loop board";
export const size = OG_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";

/** Recheck classification on each preview request. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const board = await boardBySlug(db(), (await params).slug);
  const image = await boardImage(board?.name ?? "Loop");
  image.headers.set('Cache-Control', 'private, no-store');
  return image;
}
