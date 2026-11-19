## 1. Mockup and founder decisions

- [x] 1.1 Build `public/demo/mockups-nyc-stops.html`: three looks for the way on and three for the campus choice
- [x] 1.2 Founder picks: sign A "Station sign", choice A "Two tickets" (clocktower and tram stubs)
- [x] 1.3 `public/demo/mockups-campus-swap.html`: founder picks the swap on the map, as a small luggage tag in the corner of the map's band
- [x] 1.4 Founder approves this change: the built parts as they went, and on 2026-11-19 "no chooser it'll default to the closest location depending on where you are"

## 2. A school with more than one campus, and looking at the other one (built in 551f6a7)

- [x] 2.1 `supabase/migrations/20261118700000_campus_cornell_tech.sql`: the `cornell-tech` row, with no email domains
- [x] 2.2 `lib/campus/schools.ts`: `schoolOf` (the relation, in code, design D1) and `SWAP_TICKET` (ticket words and marks)
- [x] 2.3 Door and the "no school" page list schools only (`app/door.tsx`, `app/c/week.tsx`)
- [x] 2.4 `lib/campus/session.ts`: the kit follows the school; `visits` and `mayUse` open every campus of the person's school; test in `lib/__tests__/campus-gate.test.ts`
- [x] 2.5 `components/campus/swap.tsx` and its test: the tag on the map's band and its tickets; "Visiting" on the band
- [x] 2.6 Founder runs `20261118700000_campus_cornell_tech.sql` on the hosted database
- [ ] 2.7 Founder confirms or changes: a person may join and post on a campus they are only looking at (design D10)
- [x] 2.8 The swap against real data (2026-11-19, signed out): on New York the tag on the band opens Ithaca's ticket with its real count (0 on this week) and the link to it. "Visiting" and "Your campus" are covered by `components/campus/swap.test.tsx`; not looked at signed in

## 3. A home campus: the nearer one, no question asked

- [x] 3.1 Tests for `campusOf` (design D2): a new Cornell person who seems to be in New York is placed at Cornell Tech, one nearer Ithaca at Ithaca, one with no guess at Ithaca; a school with one campus places there from anywhere; an already placed person stays; an address at no school is not placed (`lib/__tests__/campus-gate.test.ts`)
- [x] 3.2 `campusOf` takes where the person seems to be and places at the nearer campus of their school; `placeAt` moves a placed person between the campuses of their school (`lib/campus/people.ts`)
- [x] 3.3 `seemsAt` and `whereFrom` in `lib/campus/session.ts`: the host's location headers, read once by `campusViewer`; nothing is kept; tests for a good, a missing and a broken guess
- [x] 3.4 `nearestCampus` in `lib/campus/sections.ts`, by where each campus's first section rests; tests for New York nearer, Ithaca nearer, no guess, and a campus with no map (`lib/__tests__/campus-sections.test.ts`)
- [x] 3.5 Dropped by the founder (2026-11-19): the "Which Cornell?" screen `/c/choose`, its nearest-first tickets and the "Coming soon" list. Nothing of it was built
- [x] 3.6 (built 2026-11-18 with `placeAt` and `changeCampusAction`; the pill reads "Change to New York" / "Change to Ithaca", my call) "Change campus" in the account card (find it in `components/campus/screen.tsx` / `own-face.tsx`), shown only when the school has more than one campus, as a pill; test both cases, and that after a change the swap marks the new campus as "Your campus" and the old one still opens (design D5)
- [x] 3.7 Read Next's guide for `headers` in `node_modules/next/dist/docs/` before 3.3 (AGENTS.md)

## 4. New York sections

- [x] 4.1 (F and M share the 63 St tunnel since December 2025: M by day on weekdays, F nights and weekends; Q also at Lexington Av. D6 stands) Check which lines stop at Roosevelt Island, Lexington Av/63 St and 21 St–Queensbridge against the MTA's current map; correct design D6 if it is wrong
- [x] 4.2 Failing tests in the sections test file: `landOf('cornell-tech')` has the three sections; every `next` names a real section and is mutual; each section's `rest` is inside its ring; the Cornell Tech campus and the lighthouse are both inside `roosevelt`; `wayOn` from `roosevelt` toward the west gives `lex63` and toward the east `queensbridge`
- [x] 4.3 `lib/campus/sections.ts`: optional `stop` on `Section`, the line colour table, the two neighbouring sections with hand-drawn outlines, and the stop and neighbours on the island's section (the island is already drawn there as one section with none, design D10); make 4.2 pass
- [x] 4.4 Each outline drawn over the real map and looked at (2026-11-19): the island, the Upper East Side box and the Long Island City box all lie on their own land, each stop is inside its section, none overlap. The Long Island City box starts a few blocks in from the river; fine while nothing is on there

## 5. The station sign

- [x] 5.1 Failing tests in `components/campus/near.test.tsx`: by train (bullets, stop name, neighbourhood and count, is a button); greyed for nothing on / not open / nothing that way (not a button, today's words); a section with no stop renders today's markup unchanged
- [x] 5.2 `components/campus/near.tsx`: draw the sign when the way's section has a stop (design D7); styles in `app/c/campus.css` from the mockup's `.way.a`; make 5.1 pass
- [x] 5.3 The sign at the west and east edge on a phone width (2026-11-19) and a desktop width (2026-11-18): inside the map, under the band, over the dial. Seen on the phone: at the east edge the sign lies over the map's "zoom out" button while it shows; left as it is

## 6. Events and places

- [x] 6.1 (`20261118900000_campus_tech_places.sql`, coordinates from OpenStreetMap) Look up coordinates for the Cornell Tech places in design D8 and write them as `campus_place` rows, with the other names each goes by, in a new migration dated after the newest in `supabase/migrations/`
- [x] 6.2 Find Cornell Tech's public CampusGroups calendar address: `https://cornelltech.campusgroups.com/ical/cornelltech/ical_cornelltech.ics` (design D8a: 8 upcoming events, most with the place hidden)
- [x] 6.2a Cornell Tech's CampusGroups calendar added as a feed and read once (2026-11-18, at the founder's word): 39 read, 5 in the next 30 days, 3 this week, 0 on the map (no places yet)

- [x] 6.2c One-time load from the Roosevelt Islander's events page (founder, 2026-11-18: "we just want to scrape it to start, just to seed cornell tech events"): `scripts/campus-seed-island.ts`, run by hand; 23 events and 8 venues written; 9 on this week, 6 on the map. It is not kept fresh: replace it with a real feed or the publisher's permission (design D9a)
- [x] 6.7 The island has events on and stamps on the map (2026-11-19): 9 on this week, 6 of them on the map, from the one-time load in 6.2c. They run out after 2026-12-26

Moved out of this change, for a later one: Ithaca's own feed (`https://cornell.campusgroups.com/ical/cornell/ical_cornell.ics`, added on `/c/admin` when the founder wants it); finding public calendars for Roosevelt Island that publish a feed, the founder choosing which are on, adding the places they name, and the founder hiding what does not belong (design D9).

## 6a. One day on the map (founder approved `public/demo/mockups-map-day.html`, 2026-11-18)

- [x] 6a.1 The map shows one day: day pills on the band when the section has more than one day on; a ticket picked in the list brings its day
- [x] 6a.2 A stamp stands on its spot: plans at one address share one stamp with a count and an "Also here" pill on the ticket; no fan
- [x] 6a.3 Stamp, faces, postmark and ticket shrink as one from the spot when zooming out, the picked one included; the ticket fades when small

## 6b. Midtown: the Cornell Club and ILR (founder, 2026-11-19; design D6a)

- [x] 6b.1 Looked up: the two addresses, their stops, and what public calendars exist (Cornell's NYC calendar has a feed with nothing on; the Club's 25 programs are members' and have no feed; ILR lists nothing upcoming)
- [x] 6b.2 Tests, then `lib/campus/sections.ts`: `lex53` (Midtown East) and `grandcentral` (Midtown) south of the Upper East Side, their stops and line colours; ILR and the Club each inside its section
- [x] 6b.3 Both outlines drawn over the real map and looked at: on the street grid, each stop and building inside, no overlap
- [x] 6b.4 `supabase/migrations/20261119100000_campus_tech_midtown.sql`: the two places, and Cornell's NYC calendar as a feed
- [ ] 6b.5 Founder runs `20261119100000_campus_tech_midtown.sql` on the hosted database

## 7. Finish

- [x] 7.1 `tsc --noEmit` and the full test run (`--maxWorkers=3`, stderr to a file)
- [x] 7.2 The places migration is on the hosted database (checked 2026-11-19: the eight places are there)
- [x] 7.3 Signed out on the dev server (2026-11-19): Cornell Tech opens, the west and east edge of the map pushed, the whole island in view at the furthest zoom, the swap offers Ithaca. Not run signed in as a new cornell.edu person (no test account here): placing and the change in the account card are covered by `campus-gate.test.ts` and `swap.test.tsx`, and placing by location only happens on the host, which sends the location headers
- [ ] 7.4 One production build, with no dev server or other build running
