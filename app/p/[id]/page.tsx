import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProposalView } from "@/components/ProposalView";
import { Shell } from "@/components/Shell";
import { loadProposalPage } from "@/lib/proposalPage";
import { countLine } from "@/lib/view";

type Props = { params: Promise<{ id: string }> };

/** og:title is the count line; og:image carries the response count so each share gets a fresh image. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const m = await loadProposalPage(id);
  const robots = { index: false, follow: false };
  if (!m) return { robots };
  const title = countLine(m.c);
  const image = `/p/${id}/og?v=${m.responseCount}`;
  return {
    title: `${m.c.title} · Quorum`,
    alternates: { canonical: `/p/${id}` },
    openGraph: { title, description: m.c.cost ? `${m.c.cost} · tap to say you're in` : "Tap to say you're in", images: [{ url: image, width: 1200, height: 630 }], siteName: m.board.name },
    twitter: { card: "summary_large_image", title, images: [image] },
    robots,
  };
}

export default async function ProposalPage({ params }: Props) {
  const m = await loadProposalPage((await params).id);
  if (!m) notFound();
  return (
    <Shell board={m.board} tab={null}>
      <ProposalView {...m} />
    </Shell>
  );
}
