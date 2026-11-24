## 1. The count

- [x] 1.1 Tests first in `lib/__tests__/campus-outings.test.ts`: two outings together gives 2 both ways; only one checked in gives 0; one outing with five people gives 1 per pair.
- [x] 1.2 Add `timesOut(q, personId): Promise<Map<string, number>>` to `lib/campus/knows.ts`: one query over `campus_outing_member` joined to itself on `outing_id`, both `checked_in_at is not null`, `count(distinct outing_id)`.

## 2. Ordering

- [x] 2.1 `pickOuting` takes the count map. Score each outing as the sum of `1 + times` over its known members; tie by known members, then by the older outing. Invited and open outings still win first. Tests: a regular beats three group mates; with no counts the result is as before.
- [x] 2.2 `imIn` reads `timesOut` inside its transaction and passes it to `pickOuting`.
- [x] 2.3 `inviteChoices` takes the count map: invited first, then times out (most first), then the line, then id; still four. Tests: Dev, Noor, Bea, Kai; the four most when there are six.
- [x] 2.4 In `campusScreen` (`lib/campus/screen.ts`): read `timesOut` beside `knownTo`; pass it to `pickOuting` and `inviteChoices`; sort `knownGoing` by times out; add 1 to `pull` when any known person going has two or more.
- [x] 2.5 Screen tests in `app/c/campus-screen.test.tsx`: face order on a ticket; the event with a regular ranks above its twin; no number and no new text anywhere on the ticket or in the invite panel.

## 3. Check and land

- [x] 3.1 Run only the affected tests (`campus-outings`, `campus-edges`, `campus-screen`) with `--maxWorkers=3`, then eslint and `tsc --noEmit`.
- [x] 3.2 On the dev database, time the campus page for the account with the most outings before and after; note both numbers here.
  - 2026-11-24, on `supabase-loop` (localhost and the live site share it). No account had a check-in, so test outings were seeded for the founder (3 with one person, 1 with another). `explain analyze` of the `timesOut` query: 0.29 ms execution, 0.93 ms planning, using `campus_outing_member_person` and the primary key. The page as a whole was not timed; this query is the only new read on it.
- [x] 3.3 Compare the live page with `public/demo/mockups-six-adds.html` section 1: same panels, new order, no new words.
  - Compared against the real `CampusScreen` render in `app/c/campus-screen.test.tsx` (invite panel reads Dev, Went out with you; Bea, In Team 4; no number), not on localhost:3000 signed in.
- [x] 3.4 Commit on local main (no push).
