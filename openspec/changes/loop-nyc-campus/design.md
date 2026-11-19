## Context

A campus is a row in `campus` with a slug, a name, a time zone and email domains. Feeds, places, events, tags, rewards and outings all hang off a campus, and the map's sections are kept in code per campus slug (`lib/campus/sections.ts`, `LANDS`). A person is placed at one campus (`campus_person`) the first time they are seen, by the domain of their verified email (`campusOf` in `lib/campus/people.ts`), and stays there. Colours ("kit") are chosen by campus slug. The front door lists every campus as a school.

The founder asked for Cornell Tech as a location, a "which school" choice for Cornell people, "Coming soon" for the Cornell schools not open yet, and a New York feel on the map: the arrows that lead from one section to the next should be train stops. The founder was explicit that the stop is how the arrow looks, not a new rule for what opens.

The founder picked, in `public/demo/mockups-nyc-stops.html`: sign A "Station sign" and chooser A "Two tickets", and liked that one stub is the clocktower and the other the tram. That page is the reference for both looks.

## Goals / Non-Goals

**Goals:**
- A Cornell Tech student gets a week, places and a map of their own.
- A new cornell.edu person lands on the campus nearer to them, and can change it.
- The way on in New York reads as the subway.
- Ithaca behaves exactly as today.

**Non-Goals:**
- No new rule for which sections open. Standing in a section opens it and the ones next to it, as today.
- No keeping of visited stops.
- No Brooklyn or wider Manhattan sections yet. They are added later by adding sections.
- No tram, ferry or on-foot sign. The mockup showed tram and on-foot variants; the founder did not ask for them, and with one section per stop every way on is a train ride.
- No screens for the "Coming soon" schools.
- No change to the map's print look, the wall, the dial or the tickets.

## Approaches

1. **Cornell Tech as its own campus, part of Cornell (picked).** Everything per campus already works. New: a way to say one campus is part of another, and a choice where email alone no longer decides.
2. One Cornell campus with locations inside it. Every campus table and query would need a location. Much more change for the same result.
3. Cornell Tech as a fifth, unrelated school. No schema change, but the door would show Cornell twice, colours would not follow, and email could not tell the two apart anyway.

## Decisions

**D1. Which school a campus is part of is kept in code (as built).** `schoolOf(slug)` in `lib/campus/schools.ts` names a campus's school by slug: `cornell-tech` is part of `cornell`. There is no `part_of` column. The Cornell Tech row (`cornell-tech`, "Cornell Tech", America/New_York) has no email domains (`20261118700000_campus_cornell_tech.sql`), so an address alone never places anyone there; the school is found by email as before, and its campuses are the rows whose `schoolOf` is that school. *This was first written as a `campus.part_of` column. The swap was built ahead with the relation in code, and that is kept: two campuses do not earn a schema change, and the deploy does not wait on a migration. Move it to a column when a second school has parts or the admin needs to add one without a deploy.*

**D2. Placement: the nearer campus, no question asked** (founder, 2026-11-19: "no chooser it'll default to the closest location depending on where you are"). A person has one home campus (`campus_person`). It is where they land, and the one the swap calls "Your campus". When the person is not placed, `campusOf` finds the school by email as before, then that school's campuses (`schoolOf`), and places the person at the one nearest to where they seem to be (`nearestCampus` in `lib/campus/sections.ts`, by where each campus's first section rests). With no guess, or a school with one campus, it places at the school as before. Everyone already placed stays where they are, wherever they sign in from; a Cornell Tech person placed at Ithaca before this changes it in the account card (D3).

Where a person seems to be is the host's guess from the request (`x-vercel-ip-latitude`, `x-vercel-ip-longitude`, read by `seemsAt` in `lib/campus/session.ts`), not the browser's location. Nobody is prompted, and the guess is used once and not kept. On a developer's machine there is no guess, so a new Cornell person lands in Ithaca there. *My call: the network guess over the browser's prompt. A prompt before the person has seen anything is a heavy ask, and a guess that is wrong costs one press in the account card or on the swap.* The groups site (`app/groups/layout.tsx`) places without a guess; with the campus in front only the admin reaches it.

**D3. Changing it.** The account card has a row, shown only when the person's school has more than one campus, whose pill ("Change to New York") changes the home campus and opens it (`changeCampusAction`, `placeAt`, built). `placeAt` refuses a campus that is not of the person's school.

*Dropped: the "Which Cornell?" screen of two tickets (`/c/choose`), its nearest-first order, and the "Coming soon" list that lived on it. The founder picked that screen in the mockup, then chose placing by location instead. The mockup `public/demo/mockups-nyc-stops.html` still shows it.*

**D4. Cornell Tech is Cornell everywhere else (built).** The viewer's kit is their school's slug, so Cornell Tech gets Cornell Coral with no new colours. The door and the "no school" page list schools only, so they still show four.

**D5. Home and looking are two different things.** Looking at the other campus is the swap on the map (D10): it moves nothing. Changing the home campus is the account card (D3): it changes where the person lands and which campus is "Your campus", and nothing else. Outings, plans and rewards stay where they were made, and both campuses stay open to the person either way. *This replaces the first version of D5, which shut the old campus after a change; the swap made that wrong.* The swap's menu keeps saying "{home} stays yours" and does not offer to change the home: one control, one meaning.

**D6. A section's stop.** `Section` gains an optional `stop: { name: string; lines: string[] }`. A line is its letter or number; its colour comes from one small table of the lines used (`LINE` in `lib/campus/sections.ts`: F and M orange, Q yellow). The section's own name is the neighbourhood. The first New York sections:

| id | name | stop | next |
| --- | --- | --- | --- |
| `roosevelt` | Roosevelt Island | Roosevelt Island (F, M) | `lex63`, `queensbridge` |
| `lex63` | Upper East Side | Lexington Av/63 St (F, M, Q) | `roosevelt` |
| `queensbridge` | Long Island City | 21 St–Queensbridge (F, M) | `roosevelt` |

One stop is one section, and a section is everything that stop serves (founder, 2026-11-18, after the mockup showed only the campus end of the island: "it's still one train station away"). So Roosevelt Island is one section from the southern tip to the lighthouse, about 3 km long and narrow. The whole section must be in view at the map's furthest zoom, so that zoom is lower here than in Ithaca; the map already works this out from the section's outline. A section is not sized to fit the screen. Every later section follows the same rule: named for its stop, covering what is walked to from it.

Outlines are drawn by hand like Ithaca's and checked on the real map. Sections across the river do not share corners; `wayOn` works from the middles of sections, so that is fine. Which lines stop where was checked in November 2026 (task 4.1).

**D7. The station sign.** In `near.tsx`, when the section the way leads to has a stop, the way on is drawn as the sign instead of today's card:
- Open: the arrow, the line bullets, the stop's name, then the neighbourhood and "N on" ("Upper East Side · 3 on"). The neighbourhood is the section's name.
- Greyed (nothing on, not open from here, nothing that way): the same plate in grey, with today's wording, and it is not a button.

Sections with no stop (all of Ithaca) draw exactly what they draw today. The sign's look is the mockup's `.way.a`: near-black plate, white rule across the top, white type, flat hard shadow. It is the one thing on the sheet that is not in the two inks, on purpose. The line colours are fixed colours, not kit colours.

**D8. Events and places.** Places are seeded by a migration for Cornell Tech: Bloomberg Center, Tata Innovation Center, The House, Verizon Executive Education Center, Graduate Roosevelt Island, the Roosevelt Island subway station, the tram station, Four Freedoms Park. Coordinates are looked up, not guessed. The CampusGroups feed is added by the admin on `/c/admin` once its address is found; that page already does this. If Cornell Tech has no public calendar, the campus opens with plans people post and the task is closed saying so.

**D8a. What Cornell Tech's own calendar holds (looked up 2026-11-18).** Cornell Tech has its own public CampusGroups calendar, separate from Cornell's: `https://cornelltech.campusgroups.com/ical/cornelltech/ical_cornelltech.ics` (it parses as a calendar; the address redirects once). On the day it was read it held 39 events going back to September, 8 of them from that day on, and 31 of the 39 had "Sign in to download the location" where the place would be, which the reader stores as no place. So by itself it gives about two events a week, most of them not on the map. Cornell's own calendar (`.../ical/cornell/ical_cornell.ics`, 5,391 events) carries next to nothing at Cornell Tech. The places that do appear are written as a room and a street address ("Bloomberg 061, 2 W Loop Rd, New York…", "Tata 141, 2 W Loop Rd…"), so the seeded places need the short names as other names ("Bloomberg", "Tata") for these to match. No database had any feed, event or place for any campus on that day, Ithaca included; every count of "0 on this week" was true.

**D9. The island starts with real things on** (founder, 2026-11-18: the campus must feel "alive"; public feeds and calendars for the island are in, "can be curated for now"). The campus opens with events read from public calendars for Roosevelt Island, beside Cornell Tech's own:
- **Which calendars.** Found in the build and listed for the founder with what each carries: Cornell Tech's CampusGroups and public events calendars, the island's own (the operating corporation's events, the library branch, Four Freedoms Park, the island's community and arts groups), and anything else public that publishes a calendar address. Only a source that offers a calendar feed (iCal) is used; no page is scraped. The reader already takes any calendar address (`lib/campus/import.ts`), so a source is added on `/c/admin`, not in code.
- **One exception (founder, 2026-11-18).** The founder chose a one-time load of event facts from the Roosevelt Islander's events page (D9a). It is not to be re-run without the publisher's say-so.
- **Curated for now.** The founder chooses which calendars are on, and hides any event that does not belong, both on `/c/admin` as it works today (a feed can be turned off; an event can be hidden and stays hidden when the feed is read again). Nothing new is built for this. This is for seeding New York; it does not change the no-approval rule for what members post.
- **Places follow the calendars.** After the first read, the place texts that matched no named place are listed, and the ones on the island are added as places, so those events become stamps on the map. This is repeated once per calendar added.
- **Each event keeps its source.** A feed's `source` names where it came from, as "CampusGroups" does today.
- **Nothing invented.** No made-up events, no made-up people going. A count on a ticket or a sign is always real.
- **The two stops next door.** This round seeds the island only. Lexington Av/63 St and 21 St–Queensbridge get events when a calendar that covers them is added or a person posts there; until then their signs are greyed. *My call, from "for the island": say so if those two should be seeded too.*

**D9a. The Roosevelt Islander's events page (looked at 2026-11-18, at the founder's suggestion).** `rooseveltislander.com/events/` is a local news site's calendar. It is not a calendar feed: the page embeds a commercial events widget (CitySpark, portal "Roosevelt"), which gathers events within a mile of the island from sources of its own and from readers' submissions. Its first page showed 25 events over the next five weeks, every one with a venue, a street address and coordinates: the Saturday farmers market and food-scrap drop-off at Motorgate Plaza, the flea market at Church Plaza, RIVAA Gallery workshops, the library's book discussions, the senior centre, RIOC's public meetings, and two Cornell Tech talks. What it teaches:
- This is what the island's week is made of: standing weekly things at a handful of venues. Those venues are the places to seed: Motorgate Plaza, Church Plaza (Good Shepherd), RIVAA Gallery, the Roosevelt Island Library, the Cultural Center, the Carter Burden older adult centre, RIOC's office, beside the Cornell Tech buildings.
- Its Cornell Tech talks come from `tech.cornell.edu/events`, which are public talks CampusGroups does not carry. That page offers no calendar feed that was found.
- The widget's data is the vendor's and the publisher's, not a feed offered for reuse; its service marks its data paths off-limits to crawlers. It is not to be read by Loop without the publisher's say-so. The honest routes are: ask the Roosevelt Islander (or the vendor) for a feed or permission; go to the upstream sources that are public in their own right (the library, RIOC, Cornell Tech); and enter the handful of standing weekly things by hand on `/c/admin`, which covers most of what is there.
- **Founder's decision, 2026-11-18.** The founder chose a one-time load of event facts from this source (`scripts/campus-seed-island.ts`, task 6.2c). It is not to be re-run without the publisher's say-so.

**D10. Looking at another campus (founder, 2026-11-18; built in 551f6a7).** The founder asked how a person looks at the other campus when visiting or planning ahead, picked the swap on the map, then a small luggage tag in the corner of the map's band (`public/demo/mockups-campus-swap.html`).
- `mayUse` lets a person open, and act on, every campus of their school (`CampusViewer.visits`). *Joining and posting while visiting are allowed; that was the building session's call and the founder has not confirmed it.*
- The tag (`components/campus/swap.tsx`) names the campus on the page and opens one ticket per campus, each a link to `/c/<slug>`, with the real count of events this week. On a campus that is not the person's home the band says "Visiting", unless they are standing in one of its sections, when it says "You are here" as anywhere else.
- The tag lives on the map's band, so it shows in the map view only.
- That slice drew Roosevelt Island as one section with no neighbours and no stop. D6's other two sections and D7's sign were built after it.

**What that slice left open.** A Cornell Tech student was placed at Ithaca by their address and told they were "Visiting" their own campus. Placing by the nearer campus (D2) and the change in the account card (D3) fix that.

## Risks / Trade-offs

- [A Cornell Tech person was placed at Ithaca before placing by location existed] → They stay there until they change it in the account card. No one is moved for them. Until they do, the swap still gets them to New York in one press.
- [The guess is wrong: a network far from the person, or an Ithaca student signing up on a trip to the city] → One press on "Change to Ithaca" in the account card; the swap opens the other campus meanwhile.
- [Other sessions edit `sections.ts`, `near.tsx` and `campus.css` in the same tree] → Build on the tree as it stands; do not revert their changes; keep edits to those files small.
- [Line letters and bullet colours look like the MTA's signs] → Plain coloured circles with a letter and a plain plate; no MTA logo, map or typeface.
- [Hand-drawn outlines are off] → Each is checked by screenshot against the map before it ships, the island's built outline included.
- [The island's signs lead to two stops with nothing on] → D9 says so plainly; the signs are greyed, not hidden.

## Migration Plan

- `20261118700000_campus_cornell_tech.sql` (written; the founder runs it): the Cornell Tech row. Until it is run `/c/cornell-tech` does not exist, no tag shows and everyone is placed at Ithaca.
- `20261118900000_campus_tech_places.sql` (written; the founder runs it): Cornell Tech's places (D8).
- No schema change anywhere in this change. Rollback: delete the Cornell Tech row (its places and anything on it go with it); anyone whose home was Cornell Tech is unplaced and is placed again the next time they are seen.

## Open Questions

- May a person join and post while looking at a campus that is not their home? Built as yes.
