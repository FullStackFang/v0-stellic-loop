import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { SeatsGame } from '@/components/doodles/seats';
import { congaPlayer } from '@/lib/campus/conga';
import { SEATS_PAGE } from '@/lib/campus/doodles';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { campusViewer, lookingAt } from '@/lib/campus/session';
import { siteBar } from '../../site-bar';
import '@/components/doodles/seats-game.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Seats · Loopd', description: 'Three quick games against the clock: find the pairs, seat them by colour, spot who moved.' };

/**
 * Seats, a doodle, on a page of the app: the bar above and the foot below as everywhere, the game between them. Open to
 * signed-out visitors, as the Doodles page is. The game is told who is playing (the same person Conga is told of): their
 * animal is "You", and with Ink+ they choose which of their animals it is.
 */
export default async function SeatsPage() {
  const viewer = await campusViewer(), campus = await lookingAt() ?? viewer?.campus ?? await findCampus(db(), DEFAULT_CAMPUS);
  if (!campus) notFound();
  const [{ bar, foot }, player] = await Promise.all([siteBar({ campus, viewer, back: SEATS_PAGE, on: 'doodles' }), viewer ? congaPlayer(db(), viewer) : null]);
  return <div className="cs">
    {bar}
    <main className="cs-seats"><h1 className="cs-sr">Seats</h1><SeatsGame player={player && { ink: player.ink, plus: player.plus, animals: player.animals.map(({ face, picture }) => ({ face, picture })) }} /></main>
    {foot}
  </div>;
}
