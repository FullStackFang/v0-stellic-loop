import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { boardBySlug } from '@/lib/load';
import { viewer } from '@/lib/viewer';
import { getTrip, tripItems } from '@/lib/trip-store';
import { TripView } from '@/components/TripView';
export const metadata = { title: 'Cohort trip · Loop', robots: { index: false, follow: false } };
export default async function TripPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, q = db(), board = await boardBySlug(q, slug);
  if (!board) notFound();
  const trip = await getTrip(q, board.id);
  if (!trip) notFound();
  const me = await viewer(q), items = await tripItems(q, board.id, me?.id ?? null);
  const { rows: [written] } = await q.query<{ id: string; writer: string }>('select id,writer from trip_workspace where board_id=$1', [board.id]);
  const { rows: documents } = written ? await q.query<{ id: string; name: string }>('select id,name from trip_document where workspace_id=$1 order by created_at', [written.id]) : { rows: [] as { id: string; name: string }[] };
  return <TripView board={board} trip={trip} items={items} me={me ? { id: me.id, name: me.name } : null} written={written ? { id: written.id, text: written.writer, documents } : null} />;
}
