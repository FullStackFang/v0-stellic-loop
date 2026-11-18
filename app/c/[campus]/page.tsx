import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { findCampus } from '@/lib/campus/listings';
import { Week } from '../week';

export const dynamic = 'force-dynamic';

/** The campus screen, "This week". Open to signed-out visitors, who see counts and no names. */
export default async function CampusPage({ params }: { params: Promise<{ campus: string }> }) {
  const { campus: slug } = await params, campus = await findCampus(db(), slug);
  if (!campus) notFound();
  return <Week campus={campus} back={`/c/${campus.slug}`} />;
}
