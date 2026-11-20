import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { INK_MOCKUP, INK_PAGE } from '@/lib/campus/ink';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { campusViewer, lookingAt } from '@/lib/campus/session';
import { siteBar } from '../site-bar';
import { FrameWait } from '@/components/loading/frame-wait';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ink · Loop' };

/**
 * The Ink page: the same top bar as "This week", and under it the approved mockup, which fills the rest of the window
 * and scrolls on its own. Open to signed-out visitors. The bar is drawn from the screen of the campus the person was last
 * looking at, or else their own, so "This week" leads back there, and it
 * names the same groups and shows the same face.
 */
export default async function InkPage() {
  const viewer = await campusViewer(), campus = await lookingAt() ?? viewer?.campus ?? await findCampus(db(), DEFAULT_CAMPUS);
  if (!campus) notFound();
  return <div className="cs cs-inkpage">
    {(await siteBar({ campus, viewer, back: INK_PAGE, on: 'ink' })).bar}
    <FrameWait className="cs-inkframe" src={INK_MOCKUP} title="Loop Ink" />
  </div>;
}
