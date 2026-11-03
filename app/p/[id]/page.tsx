import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlanView } from "@/components/PlanView";
import { Shell } from "@/components/Shell";
import { loadProposalPage } from "@/lib/proposalPage";


type Props = { params: Promise<{ id: string }> };

/** og:title is the count line; og:image carries the response count so each share gets a fresh image. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const m = await loadProposalPage(id);
  const robots = { index: false, follow: false };
  if (!m) return { robots };
  const title = `${m.c.count} of ${m.c.threshold} \u00b7 ${m.c.title}`;
  const image = `/p/${id}/og?v=${m.responseCount}`;
  return {
    title: `${m.c.title} · Loop`,
    alternates: { canonical: `/p/${id}` },
    openGraph: { title, description: "Tap to say you are in", images: [{ url: image, width: 1200, height: 630 }], siteName: m.board.name },
    twitter: { card: "summary_large_image", title, images: [image] },
    robots,
  };
}

export default async function ProposalPage({ params }: Props) {
  const m = await loadProposalPage((await params).id);
  if (!m) notFound();
  return (
    <Shell board={m.board} tab={null} plan={m.c}>
      <PlanView {...m} />
    </Shell>
  );
}
