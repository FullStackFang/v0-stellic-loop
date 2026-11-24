import 'server-only';
import type { Q } from '../db';
import { there } from './there';

// "Interested" (openspec campus-assistant-tools, design D5): a private mark on an event. Nobody else sees it, with one
// exception: two people who know each other and have both marked the same event are each told about the other.
// Joining the event removes the mark.

/** Whether the campus-assistant migration (20261124080000) has been run. Until it has, nothing here is read or written. */
export const assistantReady = (q: Q) => there(q, 'campus_assistant',
  "select to_regclass('campus_interest') is not null and to_regclass('campus_tap') is not null and exists(select 1 from information_schema.columns where table_name='campus_outing_member' and column_name='closed_at') as ok");

/** Marks or unmarks an event for the person. Marking twice is the same as once. */
export async function setInterest(q: Q, personId: string, listingId: string, on: boolean): Promise<void> {
  if (on) await q.query('insert into campus_interest(listing_id,person_id) values($1,$2) on conflict do nothing', [listingId, personId]);
  else await q.query('delete from campus_interest where listing_id=$1 and person_id=$2', [listingId, personId]);
}

/** Which of these events the person has marked. */
export async function myInterests(q: Q, personId: string, listingIds: readonly string[]): Promise<Set<string>> {
  if (!listingIds.length) return new Set();
  const { rows } = await q.query<{ id: string }>('select listing_id as id from campus_interest where person_id=$1 and listing_id=any($2::uuid[])', [personId, listingIds]);
  return new Set(rows.map(row => row.id));
}

/**
 * The people the person knows who have marked the same events the person marked, by event. An event the person has not
 * marked has nobody: a match needs both marks.
 */
export async function matchedInterest(q: Q, personId: string, listingIds: readonly string[], known: { has(id: string): boolean }): Promise<Map<string, string[]>> {
  const matched = new Map<string, string[]>();
  if (!listingIds.length) return matched;
  const { rows } = await q.query<{ listingId: string; personId: string }>(`select o.listing_id as "listingId",o.person_id as "personId" from campus_interest mine
    join campus_interest o on o.listing_id=mine.listing_id and o.person_id<>mine.person_id
    where mine.person_id=$1 and mine.listing_id=any($2::uuid[]) order by o.created_at,o.person_id`, [personId, listingIds]);
  for (const row of rows) if (known.has(row.personId)) matched.set(row.listingId, [...(matched.get(row.listingId) ?? []), row.personId]);
  return matched;
}

/** Joining an event removes the person's mark on it. Called inside the join's transaction; before the migration it does nothing. */
export async function dropInterest(q: Q, personId: string, listingId: string): Promise<void> {
  if (await assistantReady(q)) await setInterest(q, personId, listingId, false);
}
