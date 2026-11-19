## 1. Mockup and founder decisions

- [x] 1.1 Build `public/demo/mockups-nyc-stops.html`: three looks for the way on and three for the campus choice
- [x] 1.2 Founder picks: sign A "Station sign", choice A "Two tickets" (clocktower and tram stubs)
- [x] 1.3 `public/demo/mockups-campus-swap.html`: founder picks the swap on the map, as a small luggage tag in the corner of the map's band
- [ ] 1.4 Founder approves this change (proposal, design, specs) before the rest is built

## 2. A school with more than one campus, and looking at the other one (built in 551f6a7)

- [x] 2.1 `supabase/migrations/20261118700000_campus_cornell_tech.sql`: the `cornell-tech` row, with no email domains
- [x] 2.2 `lib/campus/schools.ts`: `schoolOf` (the relation, in code, design D1) and `SWAP_TICKET` (ticket words and marks)
- [x] 2.3 Door and the "no school" page list schools only (`app/door.tsx`, `app/c/week.tsx`)
- [x] 2.4 `lib/campus/session.ts`: the kit follows the school; `visits` and `mayUse` open every campus of the person's school; test in `lib/__tests__/campus-gate.test.ts`
- [x] 2.5 `components/campus/swap.tsx` and its test: the tag on the map's band and its tickets; "Visiting" on the band
- [x] 2.6 Founder runs `20261118700000_campus_cornell_tech.sql` on the hosted database
- [ ] 2.7 Founder confirms or changes: a person may join and post on a campus they are only looking at (design D10)
- [ ] 2.8 See the swap against real data once 2.6 is done: both tickets, counts, "Visiting", back again

## 3. A home campus, chosen once

- [ ] 3.1 Failing tests for `campusOf` (design D2): one campus places as today; two campuses places nobody and reports the choices; an already placed person stays; an address at no school is null. The existing gate test that expects an unplaced Cornell person to be placed at Ithaca changes with it
- [ ] 3.2 `lib/campus/people.ts` `campusOf` and `lib/campus/session.ts` `campusViewer` (`choose`, with `visits` kept); a `placeAt(personId, campusId)` that inserts or updates `campus_person` and refuses a campus outside the person's school; make 3.1 pass and add tests for `placeAt`
- [ ] 3.3 One helper "own campus or go choose", used by `app/c/[campus]/page.tsx`, `app/c/[campus]/post/page.tsx` and wherever a signed-in person is sent to their campus; test that a Cornell viewer who has not chosen is redirected to `/c/choose` and the admin is not
- [ ] 3.4 "Coming soon" names by school slug beside `SWAP_TICKET` in `lib/campus/schools.ts` (design D3); move the tower and tram marks out of `swap.tsx` to where the chooser can use them too
- [ ] 3.4a Nearest first (design D3a): a pure function ordering campuses by distance from a point, with a centre point per campus; the page reads the host's location headers; tests for New York nearer, Ithaca nearer, and no guess (Ithaca first)
- [ ] 3.5 `app/c/choose/page.tsx` and its action in `app/c/actions.ts`: the two tickets as in the mockup (`.pa`, `.tk`), tower and tram engravings, "Coming soon" row, "You can switch any time from your picture."; styles in `app/c/campus.css` reusing the swap's `.cs-tk` tickets, and the count the swap already reads (`weekListings`); a page test covering both tickets, the coming-soon name not being a button, and a person with nothing to choose being sent on
- [x] 3.6 (built 2026-11-18 with `placeAt` and `changeCampusAction`; the pill reads "Change to New York" / "Change to Ithaca", my call) "Change campus" in the account card (find it in `components/campus/screen.tsx` / `own-face.tsx`), shown only when the school has more than one campus, as a pill; test both cases, and that after a change the swap marks the new campus as "Your campus" and the old one still opens (design D5)
- [ ] 3.7 Read Next's guide for redirects and server actions in `node_modules/next/dist/docs/` before 3.3 and 3.5 (AGENTS.md)

## 4. New York sections

- [x] 4.1 (F and M share the 63 St tunnel since December 2025: M by day on weekdays, F nights and weekends; Q also at Lexington Av. D6 stands) Check which lines stop at Roosevelt Island, Lexington Av/63 St and 21 St–Queensbridge against the MTA's current map; correct design D6 if it is wrong
- [x] 4.2 Failing tests in the sections test file: `landOf('cornell-tech')` has the three sections; every `next` names a real section and is mutual; each section's `rest` is inside its ring; the Cornell Tech campus and the lighthouse are both inside `roosevelt`; `wayOn` from `roosevelt` toward the west gives `lex63` and toward the east `queensbridge`
- [x] 4.3 `lib/campus/sections.ts`: optional `stop` on `Section`, the line colour table, the two neighbouring sections with hand-drawn outlines, and the stop and neighbours on the island's section (the island is already drawn there as one section with none, design D10); make 4.2 pass
- [ ] 4.4 (the island checked by screenshot; the two neighbours' outlines are rough boxes and have not been looked at on the map, nothing is on there yet) Check each outline on the real map by screenshot (land inside, the stop inside, no overlap) and adjust, the island's built outline included

## 5. The station sign

- [x] 5.1 Failing tests in `components/campus/near.test.tsx`: by train (bullets, stop name, neighbourhood and count, is a button); greyed for nothing on / not open / nothing that way (not a button, today's words); a section with no stop renders today's markup unchanged
- [x] 5.2 `components/campus/near.tsx`: draw the sign when the way's section has a stop (design D7); styles in `app/c/campus.css` from the mockup's `.way.a`; make 5.1 pass
- [ ] 5.3 (desktop west and east checked; phone width not pushed yet) Check the sign at each edge of the map on a phone width and a desktop width by screenshot: it stays inside the map and does not cover the band or the dial; and the whole of Roosevelt Island comes into view at the furthest zoom on both

## 6. Events and places

- [x] 6.1 (`20261118900000_campus_tech_places.sql`, coordinates from OpenStreetMap) Look up coordinates for the Cornell Tech places in design D8 and write them as `campus_place` rows, with the other names each goes by, in a new migration dated after the newest in `supabase/migrations/`
- [x] 6.2 Find Cornell Tech's public CampusGroups calendar address: `https://cornelltech.campusgroups.com/ical/cornelltech/ical_cornelltech.ics` (design D8a: 8 upcoming events, most with the place hidden)
- [x] 6.2a Cornell Tech's CampusGroups calendar added as a feed and read once (2026-11-18, at the founder's word): 39 read, 5 in the next 30 days, 3 this week, 0 on the map (no places yet)
- [ ] 6.2b Ithaca has no feed either: add `https://cornell.campusgroups.com/ical/cornell/ical_cornell.ics` for Cornell on `/c/admin` when the founder wants it

- [x] 6.2c One-time load from the Roosevelt Islander's events page (founder, 2026-11-18: "we just want to scrape it to start, just to seed cornell tech events"): `scripts/campus-seed-island.ts`, run by hand; 23 events and 8 venues written; 9 on this week, 6 on the map. It is not kept fresh: replace it with a real feed or the publisher's permission (design D9a)
- [ ] 6.3 Find public calendars for Roosevelt Island that publish a calendar feed (design D9) and give the founder the list: name, address, what it carries, roughly how many events in the next 30 days. Check each parses with `parseFeed` before listing it
- [ ] 6.4 Founder picks which calendars are on and adds them on `/c/admin`; read them once
- [ ] 6.5 After the first read, list the place texts that matched no place; add the ones on the island as places (a second small migration or the admin page, whichever the founder prefers) and confirm those events now show on the map
- [ ] 6.6 Founder looks through the first week of events and hides what does not belong
- [ ] 6.7 Check the island has events on in the week and stamps on the map before it is shown to anyone; if it is thin, say so with the counts

## 6a. One day on the map (founder approved `public/demo/mockups-map-day.html`, 2026-11-18)

- [x] 6a.1 The map shows one day: day pills on the band when the section has more than one day on; a ticket picked in the list brings its day
- [x] 6a.2 A stamp stands on its spot: plans at one address share one stamp with a count and an "Also here" pill on the ticket; no fan
- [x] 6a.3 Stamp, faces, postmark and ticket shrink as one from the spot when zooming out, the picked one included; the ticket fades when small

## 7. Finish

- [x] 7.1 `tsc --noEmit` and the full test run (`--maxWorkers=3`, stderr to a file): 1310 passed, 2026-11-18
- [ ] 7.2 Founder applies the places migration to the hosted database
- [ ] 7.3 Sign in as a new cornell.edu person on the dev server: choose New York, land on Cornell Tech, push each edge of the map, look at Ithaca through the swap and come back, then change campus to Ithaca in the account card
- [ ] 7.4 One production build, with no dev server or other build running
