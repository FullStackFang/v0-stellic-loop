import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { listCampuses } from '@/lib/campus/listings';
import { outingByToken } from '@/lib/campus/outings';
import { Week } from '../../c/week';

export const dynamic = 'force-dynamic';

/** A share link to one outing: the campus screen with that event's panel open and "Join". An unknown link is not found. */
export default async function OutingLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params, outing = await outingByToken(db(), token);
  const campus = outing && (await listCampuses(db())).find(each => each.id === outing.campusId);
  if (!outing || !campus) notFound();
  return <Week campus={campus} back={`/o/${token}`} link={{ token, outingId: outing.id, listingId: outing.listingId }} />;
}
