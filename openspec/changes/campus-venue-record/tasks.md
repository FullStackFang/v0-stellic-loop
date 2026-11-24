## 1. Database

- [x] 1.1 Add migration `supabase/migrations/<stamp>_campus_place_record.sql`: `campus_place.record_token text unique` (check: 16 to 64 url-safe characters) and `campus_place.record_public boolean not null default false`.
- [x] 1.2 Confirm it applies in the PGlite test database (`test/db.ts`).

## 2. The counts (`lib/campus/record.ts`)

- [x] 2.1 Tests first, in `lib/__tests__/campus-record.test.ts`, one per scenario of "Three numbers for a place": said only; showed up; one person alone; came back; another place; no matched place.
- [x] 2.2 `placeRecord(q, placeId, span, tz, now)` returning `{ said, people, showed, back, weeks, sizes, days }`, with `weeks`, `sizes` and `days` null when `showed < 5`.
- [x] 2.3 Tests for the span (4 weeks, 8 weeks, all time), the week boundary in the campus timezone, and the breakdowns adding up to `showed`.
- [x] 2.4 `recordReady(q)` (do the columns exist), `recordLink(q, placeId)` (make the token on first use), `renewRecordLink`, `setRecordPublic`, and `findRecord(q, campusSlug, placeTag, key)` returning the place or null.

## 3. The page

- [x] 3.1 Read the Next.js guides this needs in `node_modules/next/dist/docs/` (dynamic routes, `notFound`, metadata and robots) before writing the route.
- [x] 3.2 `app/places/[campus]/[place]/record/page.tsx`: not found unless the key matches or the record is public; span pills as links (`?span=4|8|all`); the three number cards; the three panels when present; the note. `noindex` unless public.
- [x] 3.3 Styles to match `public/demo/mockups-six-adds.html` section 2: band in the campus field colour, cards with the hard shadow, a filled tab on each panel, one column under 700px. Every control a pill; no scroll bars; nothing that changes height when the span changes.
- [x] 3.4 Page tests: with key, without key, wrong key, public, fewer than five groups, and that the HTML holds no name or id of any member.

## 4. Admin

- [x] 4.1 On the Places tab of `/c/admin`: per place, "Copy record link", "New link" and a Public switch, using the existing admin action pattern. Before the migration, the tab names the file to run.
- [x] 4.2 Action tests: copy makes a token once; new link stops the old; switch; refused for a non-admin.

## 5. Check and land

- [x] 5.1 Run only the affected tests with `--maxWorkers=3`, then eslint and `tsc --noEmit`.
- [x] 5.2 On the dev database, open the record for a place with real outings on a laptop and a phone width, and compare with the mockup.
- [x] 5.3 Commit on local main (no push). Paste the migration SQL in the reply for the founder to run.
