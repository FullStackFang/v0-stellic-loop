import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { findCampus } from '@/lib/campus/listings';
import { campusViewer, signInHref } from '@/lib/campus/session';
import { Week } from '../week';

export const dynamic = 'force-dynamic';

/**
 * The campus screen, "This week". For people signed in only: someone signed out is sent to sign in, and back here.
 * The Ink page and Doodles stay open to everyone.
 */
export default async function CampusPage({ params }: { params: Promise<{ campus: string }> }) {
  const { campus: slug } = await params, campus = await findCampus(db(), slug);
  if (!campus) notFound();
  if (!await campusViewer()) redirect(signInHref(`/c/${campus.slug}`));
  return <Week campus={campus} back={`/c/${campus.slug}`} />;
}
