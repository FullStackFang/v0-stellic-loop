import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { DoodleShelf } from '@/components/campus/doodles';
import { DOODLES_PAGE, doodlesFor } from '@/lib/campus/doodles';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { campusViewer, lookingAt } from '@/lib/campus/session';
import { siteBar } from '../site-bar';
import '@/components/campus/doodles.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Doodles · Loopd', description: 'Something to play while your group gathers.' };

/**
 * Doodles: the games, as tickets on a rail (openspec/changes/loop-doodles). Open to signed-out visitors, as Conga is. The bar
 * is drawn from the campus the person was last looking at, as on the Ink page. The admin also sees the staged ones.
 */
export default async function DoodlesPage() {
  const viewer = await campusViewer(), campus = await lookingAt() ?? viewer?.campus ?? await findCampus(db(), DEFAULT_CAMPUS);
  if (!campus) notFound();
  const { bar, foot } = await siteBar({ campus, viewer, back: DOODLES_PAGE, on: 'doodles' });
  return <div className="cs">
    {bar}
    <main className="cs-dd-page"><h1 className="cs-sr">Doodles</h1><DoodleShelf doodles={doodlesFor(viewer?.admin ?? false)} /></main>
    {foot}
  </div>;
}
