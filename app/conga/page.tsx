import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { findCampus } from '@/lib/campus/listings';
import { DEFAULT_CAMPUS } from '@/lib/campus/schools';
import { campusViewer, lookingAt } from '@/lib/campus/session';
import { siteBar } from '../c/site-bar';
import { CongaFrame } from './frame';
import './conga.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Conga · Loopd', description: 'Walk your animal round campus and gather the longest line.' };

/**
 * Conga in the app (/demo/mockups-conga-board.html): the game fills the screen (app/conga/play), and the app's bar and foot
 * lie over it whenever a card is up (start, paused, over) and slide away while it is played. The bar is drawn from the
 * campus the person was last looking at, as on Doodles. What the address asks of the game (?map=, ?ink) is passed on to it.
 */
export default async function CongaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await campusViewer(), campus = await lookingAt() ?? viewer?.campus ?? await findCampus(db(), DEFAULT_CAMPUS);
  if (!campus) notFound();
  const { bar, foot } = await siteBar({ campus, viewer, back: '/conga', on: 'doodles' });
  const asked = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) for (const each of [value].flat()) if (each != null) asked.append(key, each);
  return <div className="cs cg-page">
    {bar}
    <CongaFrame src={`/conga/play${asked.size ? `?${asked}` : ''}`} />
    {foot}
  </div>;
}
