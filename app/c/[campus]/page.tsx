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
export default async function CampusPage({ params, searchParams }: { params: Promise<{ campus: string }>; searchParams?: Promise<{ post?: string | string[] }> }) {
  const [{ campus: slug }, { post }] = await Promise.all([params, searchParams ?? Promise.resolve({ post: undefined })]), campus = await findCampus(db(), slug);
  if (!campus) notFound();
  // ?post= is an event page's link to start a plan from (the browser extension's "Finish in Loopd").
  const link = typeof post === 'string' && /^https:\/\/\S{1,2000}$/.test(post) ? post : undefined, back = `/c/${campus.slug}${link ? `?post=${encodeURIComponent(link)}` : ''}`;
  if (!await campusViewer()) redirect(signInHref(back));
  return <Week campus={campus} back={back} post={link} />;
}
