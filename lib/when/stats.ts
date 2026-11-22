import type { Db } from '../db';

// The three numbers that say whether Loopd When works: do people who open a poll answer it, do polls reach their
// threshold, and does a group come back within thirty days.

export type WhenStats = { opened: number; answered: number; answerRate: number | null; ready: number; readyMet: number; metRate: number | null; series: number; repeated: number; repeatRate: number | null };
const rate = (part: number, whole: number) => whole ? part / whole : null;

export async function whenStats(db: Db): Promise<WhenStats> {
  const { rows: [n] } = await db.query<{ opened: number; answered: number; ready: number; met: number; series: number; repeated: number }>(`select
    (select count(distinct visitor)::int from when_event where kind='poll_opened') as opened,
    (select count(distinct person_id)::int from when_event where kind='response_saved') as answered,
    (select count(*)::int from when_poll where ready_at is not null) as ready,
    (select count(*)::int from when_poll where ready_met) as met,
    (select count(*)::int from when_poll where id=series_id) as series,
    (select count(*)::int from when_poll f where f.id=f.series_id and exists(select 1 from when_poll s where s.series_id=f.id and s.id<>f.id and s.created_at<=f.created_at+interval '30 days')) as repeated`);
  return { opened: n.opened, answered: n.answered, answerRate: rate(n.answered, n.opened), ready: n.ready, readyMet: n.met, metRate: rate(n.met, n.ready), series: n.series, repeated: n.repeated, repeatRate: rate(n.repeated, n.series) };
}
