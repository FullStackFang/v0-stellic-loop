import { timingSafeEqual } from 'node:crypto';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { whenStats } from '@/lib/when/stats';
import { Panel, Ticket } from '../parts';

export const metadata: Metadata = { title: 'Loopd When numbers', robots: { index: false, follow: false } };

const percent = (rate: number | null) => rate === null ? 'No data yet' : `${Math.round(rate * 100)}%`;
function allowed(key: string | undefined): boolean {
  const secret = process.env.WHEN_STATS_SECRET;
  if (!secret || typeof key !== 'string') return false;
  const given = Buffer.from(key), wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

// The three numbers, for whoever holds the key (WHEN_STATS_SECRET). To anyone else there is no such page.
export default async function StatsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  if (!allowed((await searchParams).key)) notFound();
  const n = await whenStats(db());
  return <main className="wn">
    <Ticket stub="Since the first poll, all polls together."><h1 className="xl">Loopd When, <em>in three numbers.</em></h1></Ticket>
    {[['People who answer after opening', percent(n.answerRate), `${n.answered} of ${n.opened} browsers that opened a poll`],
      ['Polls that reach their threshold', percent(n.metRate), `${n.readyMet} of ${n.ready} polls that became ready`],
      ['Groups that ask again within 30 days', percent(n.repeatRate), `${n.repeated} of ${n.series} groups`]].map(([tab, big, line]) =>
      <Panel key={tab} tab={tab}><ul className="wn-rows"><li><span><b style={{ fontSize: 28 }}>{big}</b><small>{line}</small></span></li></ul></Panel>)}
  </main>;
}
