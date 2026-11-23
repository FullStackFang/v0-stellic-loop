import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { DoodleShelf } from '@/components/campus/doodles';
import { THANKED, ThanksCard } from '@/components/campus/thanks-card';
import { OPEN_AT, schoolAsked, schoolStanding } from '@/lib/campus/school-ask';
import { DOODLES_PAGE, doodlesFor } from '@/lib/campus/doodles';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { campusViewer, lookingAt } from '@/lib/campus/session';
import { siteBar } from '../site-bar';
import '@/components/campus/doodles.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Doodles · Loopd', description: 'Something to play while your group gathers.' };

/**
 * Doodles: the games, each shown being played (openspec/changes/loop-doodles). Open to signed-out visitors, as Conga is. The bar
 * is drawn from the campus the person was last looking at, as on the Ink page. The admin also sees the staged ones.
 * Someone signed in with an email at no school lands here (public/demo/mockups-any-email.html, B): the games are theirs,
 * and the thanks card sits beside the page's name until they put it away.
 */
export default async function DoodlesPage() {
  const viewer = await campusViewer(), campus = await lookingAt() ?? viewer?.campus ?? await findCampus(db(), DEFAULT_CAMPUS);
  if (!campus) notFound();
  const { bar, foot } = await siteBar({ campus, viewer, back: DOODLES_PAGE, on: 'doodles' });
  const thanks = viewer && !viewer.campus && !viewer.admin && !(await cookies()).has(THANKED);
  const [asked, standing] = thanks ? await Promise.all([schoolAsked(db(), viewer.personId), schoolStanding(db(), viewer.personId)]) : [null, null];
  return <div className="cs">
    {bar}
    <main className="cs-dd-page">
      {/* The page is its name, the games being played, and Play (public/demo/mockups-doodles-shots.html, B). */}
      <div className="cs-dd-top"><h1 className="cs-dd-head">Doodles</h1>
        {thanks && <ThanksCard asked={asked} email={viewer.principal.verifiedEmail ?? null} standing={standing && { school: standing.school, place: standing.place, left: OPEN_AT - standing.people }} />}</div>
      <DoodleShelf doodles={doodlesFor(viewer?.admin ?? false)} campus={campus} /></main>
    {foot}
  </div>;
}
