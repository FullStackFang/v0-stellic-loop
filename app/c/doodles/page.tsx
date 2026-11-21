import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { DoodleShelf } from '@/components/campus/doodles';
import { DOODLES_PAGE, doodlesFor, term } from '@/lib/campus/doodles';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { campusViewer, lookingAt } from '@/lib/campus/session';
import { siteBar } from '../site-bar';
import '@/components/campus/doodles.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Doodles · Loopd', description: 'Something to play while your group gathers.' };

/**
 * Doodles: the games, as courses of the campus on tickets (openspec/changes/loop-doodles). Open to signed-out visitors, as Conga is. The bar
 * is drawn from the campus the person was last looking at, as on the Ink page. The admin also sees the staged ones.
 */
export default async function DoodlesPage() {
  const viewer = await campusViewer(), campus = await lookingAt() ?? viewer?.campus ?? await findCampus(db(), DEFAULT_CAMPUS);
  if (!campus) notFound();
  const { bar, foot } = await siteBar({ campus, viewer, back: DOODLES_PAGE, on: 'doodles' });
  return <div className="cs">
    {bar}
    <main className="cs-dd-page">
      {/* The shelf as a course catalogue of the campus (public/demo/mockups-doodles-campus.html, B). */}
      <header className="cs-dd-head"><div><small>{term(new Date())} · {campus.name}</small><h1>Courses you can pass between classes</h1></div><p>No prerequisites and no grade, open to everyone at {campus.name}. Take one while your group gathers.</p></header>
      <DoodleShelf doodles={doodlesFor(viewer?.admin ?? false)} campus={campus} /></main>
    {foot}
  </div>;
}
