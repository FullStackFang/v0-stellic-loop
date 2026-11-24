import 'server-only';
import type { Q } from '../db';
import { plausible } from './conga-board';

// Conga for the admin's Activity section (app/c/admin/stats.tsx): every round that ends is kept in conga_round, signed
// in or not, so the game's numbers are the whole of them and not only the weekly board's. A guest is the random number
// their browser carries (app/c/seen), so each counts once and nothing says who they are.

/** 42P01: conga_round is not there yet (its migration is run by hand). Until it is, no round is counted. */
const noTable = (error: unknown) => (error as { code?: string })?.code === '42P01';

/** Keeps one round that ended: whose it was (a person, else a browser, else neither), the map, the line it ended with. Says whether it was kept. */
export async function logRound(q: Q, who: { personId: string | null; visitor: string | null }, round: { map: string; best: number; seconds: number }): Promise<boolean> {
  if (!plausible(round)) return false;
  const visitor = who.personId || !who.visitor || !/^[0-9a-f]{32}$/.test(who.visitor) ? null : who.visitor;
  try {
    await q.query('insert into conga_round(person_id,visitor,map,line,seconds) values($1,$2,$3,$4,$5)', [who.personId, visitor, round.map, round.best, Math.round(round.seconds)]);
    return true;
  } catch (error) {
    if (noTable(error)) return false;
    throw error;
  }
}

/**
 * Conga since `since` (null: ever). `players` and `guests`: people signed in and browsers signed out who ended a round.
 * `opened`: those who opened Conga since the day rounds began to be counted, and `played` how many of them ended a round. `since`
 * is the day counting began, null before any round or before the table is there.
 */
export type CongaStats = { rounds: number; guestRounds: number; players: number; guests: number; opened: number; played: number; longest: { line: number; map: string } | null; maps: { map: string; rounds: number }[]; since: string | null };
const NONE: CongaStats = { rounds: 0, guestRounds: 0, players: 0, guests: 0, opened: 0, played: 0, longest: null, maps: [], since: null };

export async function congaStats(q: Q, since: Date | null, tz: string): Promise<CongaStats> {
  const from = since?.toISOString() ?? null, within = `($1::timestamptz is null or at>=$1)`;
  try {
    const [all, maps] = await Promise.all([
      q.query<Omit<CongaStats, 'maps' | 'longest'> & { line: number | null; map: string | null }>(`with r as (select * from conga_round where ${within}),
        began as (select greatest($1::timestamptz, (select date_trunc('day', min(at) at time zone $2) at time zone $2 from conga_round)) as at),
        opened as (select distinct coalesce(person_id::text, visitor) as who from site_open where area='Conga' and (person_id is not null or visitor is not null) and opened_at>=(select at from began)),
        played as (select distinct coalesce(person_id::text, visitor) as who from r where person_id is not null or visitor is not null)
        select (select count(*)::int from r) as rounds, (select count(*)::int from r where person_id is null) as "guestRounds",
          (select count(distinct person_id)::int from r) as players, (select count(distinct visitor)::int from r where person_id is null) as guests,
          (select count(*)::int from opened) as opened, (select count(*)::int from opened join played using (who)) as played,
          (select line from r order by line desc, at limit 1) as line, (select map from r order by line desc, at limit 1) as map,
          (select to_char((min(at) at time zone $2)::date,'YYYY-MM-DD') from conga_round) as since`, [from, tz]),
      q.query<{ map: string; rounds: number }>(`select map, count(*)::int as rounds from conga_round where ${within} group by map order by rounds desc, map`, [from]),
    ]);
    const { line, map, ...row } = all.rows[0];
    return { ...row, longest: line && map ? { line, map } : null, maps: maps.rows };
  } catch (error) {
    if (noTable(error)) return NONE;
    throw error;
  }
}
