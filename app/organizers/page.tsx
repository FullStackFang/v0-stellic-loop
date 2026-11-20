import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { IMPRINT_MOCKUP, IMPRINT_PAGE } from '@/lib/campus/imprint';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { campusViewer, lookingAt } from '@/lib/campus/session';
import { siteBar } from '@/app/c/site-bar';
import { FrameWait } from '@/components/loading/frame-wait';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'For organizers · Loopd', description: 'Claim your club on Loopd, and see what Imprint, the club membership, would pay back.' };

/**
 * The organizers page, where "Claim your club" leads: the same top bar as "This week", and under it the approved
 * mockup, which fills the rest of the window and scrolls on its own, as the Ink page does (app/c/ink). Open to
 * signed-out visitors. Its form is kept by ./ask/route.ts.
 */
export default async function OrganizersPage() {
  const viewer = await campusViewer(), campus = await lookingAt() ?? viewer?.campus ?? await findCampus(db(), DEFAULT_CAMPUS);
  if (!campus) notFound();
  const { bar, foot } = await siteBar({ campus, viewer, back: IMPRINT_PAGE, on: 'organizers' });
  return <>
    <div className="cs cs-inkpage">{bar}<FrameWait className="cs-inkframe" src={IMPRINT_MOCKUP} title="Loopd for organizers" /></div>
    {foot}
  </>;
}
