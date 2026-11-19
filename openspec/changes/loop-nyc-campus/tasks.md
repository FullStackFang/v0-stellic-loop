## 1. Mockup and founder decisions

- [x] 1.1 Build `public/demo/mockups-nyc-stops.html`: three looks for the way on and three for the campus choice
- [x] 1.2 Founder picks: sign A "Station sign", choice A "Two tickets" (clocktower and tram stubs)
- [ ] 1.3 Founder approves this change (proposal, design, specs) before any code

## 2. A school with more than one campus

- [ ] 2.1 Migration dated after the newest in `supabase/migrations/`: `campus.part_of` (nullable, references `campus`, a part cannot have parts), the `cornell-tech` row as part of `cornell`. Written for a by-hand run with a lock timeout, like `20261117000000_campus.sql`
- [ ] 2.2 Failing tests first (`lib/__tests__/`, hosted database, no Docker): `listCampuses` and `findCampus` return `partOf`; the schools list leaves parts out; `schoolOfEmail` given schools only still matches subdomains
- [ ] 2.3 `lib/campus/listings.ts`: `Campus.partOf`; a `schools` helper (campuses with no parent) and `campusesOf(school)`; make 2.2 pass
- [ ] 2.4 Door and sign-in card (`components/campus/door.tsx`, the page that feeds it) receive schools only; test that Cornell shows once with Cornell Tech in the table
- [ ] 2.5 Kit follows the school: the viewer's kit in `lib/campus/session.ts` is the parent's slug for a part; test that a Cornell Tech viewer's kit is `cornell`

## 3. Placement and the choice

- [ ] 3.1 Failing tests for `campusOf` (design D2): one campus places as today; two campuses places nobody and reports the choices; an already placed person stays; an address at no school is null
- [ ] 3.2 `lib/campus/people.ts` `campusOf` and `lib/campus/session.ts` `campusViewer` (`choose`); a `placeAt(personId, campusId)` that inserts or updates `campus_person` and refuses a campus outside the person's school; make 3.1 pass and add tests for `placeAt`
- [ ] 3.3 One helper "own campus or go choose", used by `app/c/[campus]/page.tsx`, `app/c/[campus]/post/page.tsx` and wherever a signed-in person is sent to their campus; test that a Cornell viewer who has not chosen is redirected to `/c/choose` and the admin is not
- [ ] 3.4 Ticket words and "Coming soon" names by slug in `lib/campus/schools.ts` (design D3); a read of events on in the next seven days per campus for the ticket's count
- [ ] 3.4a Nearest first (design D3a): a pure function ordering campuses by distance from a point, with a centre point per campus; the page reads the host's location headers; tests for New York nearer, Ithaca nearer, and no guess (Ithaca first)
- [ ] 3.5 `app/c/choose/page.tsx` and its action in `app/c/actions.ts`: the two tickets as in the mockup (`.pa`, `.tk`), tower and tram engravings, "Coming soon" row, "You can switch any time from your picture."; styles in `app/c/campus.css` reusing the door ticket's where they exist; a page test covering both tickets, the coming-soon name not being a button, and a person with nothing to choose being sent on
- [ ] 3.6 "Change campus" in the account card (find it in `components/campus/screen.tsx` / `own-face.tsx`), shown only when the school has more than one campus, as a pill; test both cases
- [ ] 3.7 Read Next's guide for redirects and server actions in `node_modules/next/dist/docs/` before 3.3 and 3.5 (AGENTS.md)

## 4. New York sections

- [ ] 4.1 Check which lines stop at Roosevelt Island, Lexington Av/63 St and 21 St–Queensbridge against the MTA's current map; correct design D6 if it is wrong
- [ ] 4.2 Failing tests in the sections test file: `landOf('cornell-tech')` has the three sections; every `next` names a real section and is mutual; each section's `rest` is inside its ring; the Cornell Tech campus and the lighthouse are both inside `roosevelt`; `wayOn` from `roosevelt` toward the west gives `lex63` and toward the east `queensbridge`
- [ ] 4.3 `lib/campus/sections.ts`: optional `stop` on `Section`, the line colour table, and the three sections with hand-drawn outlines (Roosevelt Island is the whole island, design D6) (on top of the other session's uncommitted edits; do not revert them); make 4.2 pass
- [ ] 4.4 Check each outline on the real map by screenshot (land inside, the stop inside, no overlap) and adjust

## 5. The station sign

- [ ] 5.1 Failing tests in `components/campus/near.test.tsx`: by train (bullets, stop name, neighbourhood and count, is a button); greyed for nothing on / not open / nothing that way (not a button, today's words); a section with no stop renders today's markup unchanged
- [ ] 5.2 `components/campus/near.tsx`: draw the sign when the way's section has a stop (design D7); styles in `app/c/campus.css` from the mockup's `.way.a`; make 5.1 pass
- [ ] 5.3 Check the sign at each edge of the map on a phone width and a desktop width by screenshot: it stays inside the map and does not cover the band or the dial; and the whole of Roosevelt Island comes into view at the furthest zoom on both

## 6. Events and places

- [ ] 6.1 Look up coordinates for the Cornell Tech places in design D8 and add them to the migration from 2.1 as `campus_place` rows, with the other names each goes by
- [ ] 6.2 Find Cornell Tech's public CampusGroups calendar address. If there is one, give it to the founder to add on `/c/admin`; if there is none, say so here and close the task

- [ ] 6.3 Find public calendars for Roosevelt Island that publish a calendar feed (design D9) and give the founder the list: name, address, what it carries, roughly how many events in the next 30 days. Check each parses with `parseFeed` before listing it
- [ ] 6.4 Founder picks which calendars are on and adds them on `/c/admin`; read them once
- [ ] 6.5 After the first read, list the place texts that matched no place; add the ones on the island as places (a second small migration or the admin page, whichever the founder prefers) and confirm those events now show on the map
- [ ] 6.6 Founder looks through the first week of events and hides what does not belong
- [ ] 6.7 Check the island has events on in the week and stamps on the map before it is shown to anyone; if it is thin, say so with the counts

## 7. Finish

- [ ] 7.1 `tsc --noEmit` and the full test run (`--maxWorkers=3`, stderr to a file)
- [ ] 7.2 Founder applies the migration to the hosted database
- [ ] 7.3 Sign in as a new cornell.edu person on the dev server: choose New York, see the map on Cornell Tech, push each edge, change campus back to Ithaca
- [ ] 7.4 One production build, with no dev server or other build running
