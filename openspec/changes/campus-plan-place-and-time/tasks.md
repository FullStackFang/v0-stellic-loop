## 1. Data

- [x] 1.1 Write `scripts/campus-places-osm.mjs`: for a campus slug and its sections (from `lib/campus/sections.ts`), ask the public Overpass API for named food/drink, parks, pitches and sports centres, public buildings and stations inside each section's ring; drop homes, dormitories, schools, plant rooms, garages and toilets; print one `insert … on conflict do nothing` row per place with name, other names (the short @name), kind, lat, lon (design D3). Read its output by eye before it goes into SQL.
- [x] 1.2 Migration `supabase/migrations/2026112404xxxx_campus_plan_place_and_time.sql` (lock_timeout, one transaction, additive): `campus_listing.time_open boolean not null default false`; `campus_place.kind` with its check; table `campus_time_pick(listing_id, person_id, at time, primary key(listing_id, person_id, at))` with foreign keys cascading and an index on listing; the Cornell Tech island places from 1.1, plus kinds for the eight venues already seeded. Hand the SQL to the founder; do not run it.

## 2. Reading the line and places (pure, browser and server)

- [x] 2.1 `lib/campus/line.ts`: `readLine` returns `day` ('YYYY-MM-DD'): the day or date named, or today when none (design D2). Tests in `lib/__tests__/campus-line.test.ts`: "run tomorrow" → tomorrow, no starts; "run" → today; "run tomorrow 7am" unchanged.
- [x] 2.2 `lib/campus/places.ts`: `placeTag(place)`, `placeFor(places, slug)`, `PLACES_REQUIRED`, and a `PlaceKind` type; split what the browser needs into a file without 'server-only' if needed. Tests: "Southpoint Park" with other name "southpoint" → `southpoint`; a slug matching no place → null.
- [x] 2.3 `offeredTimes(day, tz, now)` (five times, today only those 30+ minutes ahead) beside the line helpers, with tests for morning, evening and late-night cases.

## 3. Posting and the time (server)

- [x] 3.1 `lib/campus/plans.ts` `postPlan`: accept a day with no start (`starts_at` = day 00:00, `ends_at` = 23:59, `time_open`), refuse a today plan with no offered time left, 14-day rule on the day; on `PLACES_REQUIRED` campuses resolve the first place @ (set `place_id`, `place_text`, and that tag's kind to `place`) or refuse "Where do you meet? Pick a place."; the three-plan limit counts by `coalesce(ends_at, starts_at)`. Same place rule in `changePlan`; "has it started" uses the day's end while `time_open`.
- [x] 3.2 `app/c/actions.ts` `postLineAction`: post with `read.starts` or `read.day`; drop the "When is it?" refusal.
- [x] 3.3 `pickTime` and `setTime` in `lib/campus/plans.ts` (design D6) with actions `pickTimeAction(listingId, at)` and `setTimeAction(listingId, at)`; only people in the plan pick, only the poster or admin sets, only while `time_open`, only times still ahead; setting clears the picks in the same transaction.
- [x] 3.4 `lib/campus/listings.ts` / `lib/campus/screen.ts`: tickets carry `timeOpen`, `byFace` (the poster's animal for `origin = 'member'`), and for a time-open plan the offered times with who marked each (through the outings visibility rules), the viewer's own marks, and how many have answered.
- [x] 3.5 Server tests (`lib/__tests__/campus-plan-time.test.ts`, extend `campus-outings` / `campus-listings` as needed): post with day only; refused today too late; required place refused and accepted; @rooftop refused; Ithaca unchanged; limit counts a time-open plan; pick toggles; non-member pick refused; set by poster moves the plan and clears picks; set by someone else refused; a time-open plan leaves the week list after its day.

## 4. Posting panel

- [x] 4.1 `components/campus/composer.tsx`: on `PLACES_REQUIRED` campuses, the where line and the place picker (tabs Near you · Food · Parks · Sports · Buildings, fixed-height box, no scroll), pill press writes or replaces the place @ in the line, "@" + letters narrows across kinds, Post disabled until a place resolves. Near you uses the browser location if already granted to the map, else the most-used places (count of plans per place, from the screen data). Look as in `public/demo/mockups-map-intent.html`.
- [x] 4.2 Wide screen: while posting, `components/campus/near.tsx` draws every place of the section as a dot (open tab ringed, name on hover), a dot press picks it, and the picked place shows the poster's animal stamp. Phone: a map strip in the panel opens the Near you map in picking mode with a Done pill.
- [x] 4.3 Component tests for the composer: pill writes the @, a second pill replaces it, partial @ narrows, Post disabled without a place, unchanged on a campus that does not require places.

## 5. Time on the plan

- [x] 5.1 `components/campus/screen.tsx`: a time-open ticket shows "?" in its time tile; for people in it (not the poster) "When works for you?" with the times as one-press buttons and the marked animals, opening first after "I'm in"; for the poster "Pick a time" with counts, the most-marked lit, "Send <time>". After sending, people in see "<poster> set it: <day> at <time>." Look as in `public/demo/mockups-map-time.html`.
- [x] 5.2 `components/campus/near.tsx`: a member plan's stamp carries `byFace` in place of the guessed picture; a time-open stamp is white with a red "?" and its day.
- [x] 5.3 Source bar: "Best for you · People · <listSource>" and the soon names; phone tabs get "People"; "People" filters list and map to member plans.
- [x] 5.4 Component tests: time-open ticket for a member vs the poster, Send disabled with no marks, People filter hides calendar events, member stamp shows the face.

## 6. Check

- [x] 6.1 Run only the affected tests (grep for the changed files' tests), `tsc --noEmit`, eslint on changed files.
- [ ] 6.2 Once the founder has run the SQL: on localhost `/c/cornell-tech`, post "run @southpoint tomorrow", see "Tue ?" on the map; with a second account say I'm in and mark 7am; as the poster send 7am; check the People filter. Then one production build.

## 7. Added during build (founder, 2026-11-23)

- [x] 7.1 The poster can cancel their plan until it ends (not only until it starts), from a two-press "Cancel this plan" in its details in place of "Leave"; `cancelPlanAction`; tests in `campus-plan-time`, `campus-outings`, `plan-time.test.tsx`.
