## Context

A campus is a row in `campus` with a slug, a name, a time zone and email domains. Feeds, places, events, tags, rewards and outings all hang off a campus, and the map's sections are kept in code per campus slug (`lib/campus/sections.ts`, `LANDS`). A person is placed at one campus (`campus_person`) the first time they are seen, by the domain of their verified email (`campusOf` in `lib/campus/people.ts`), and stays there. Colours ("kit") are chosen by campus slug. The front door lists every campus as a school.

The founder asked for Cornell Tech as a location, a "which school" choice for Cornell people, "Coming soon" for the Cornell schools not open yet, and a New York feel on the map: the arrows that lead from one section to the next should be train stops. The founder was explicit that the stop is how the arrow looks, not a new rule for what opens.

The founder picked, in `public/demo/mockups-nyc-stops.html`: sign A "Station sign" and chooser A "Two tickets", and liked that one stub is the clocktower and the other the tram. That page is the reference for both looks.

## Goals / Non-Goals

**Goals:**
- A Cornell Tech student gets a week, places and a map of their own.
- A cornell.edu person picks a campus once, and can change it.
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

**D1. `campus.part_of`.** A nullable reference from a campus to another campus. Cornell Tech (`cornell-tech`, name "Cornell Tech", America/New_York, `{cornell.edu}`, list source "CampusGroups") is part of `cornell`. A campus that is part of another cannot itself have parts (a check, or enforced in the one function that reads them). `Campus` gains `partOf: string | null` (the parent's slug). The "school" of a campus is its parent, or itself.

**D2. Placement.** `campusOf` keeps returning the placed campus. When the person is not placed: find the school by email as today (among campuses with no parent), then its campuses (itself plus its parts). One campus: place there, as today. More than one: place nobody and report that a choice is needed. `campusViewer` carries that (`choose: Campus[]`, empty when none is needed) and its `campus` falls back as it does today. Every campus page that needs the viewer's campus sends a viewer with a choice to make to `/c/choose` (one helper, used by `app/c/[campus]/page.tsx`, the post page and wherever a signed-in person is sent to "their" campus). The admin is not sent there.

**D3. The chooser, `/c/choose`.** Signed-in only. Shows the two tickets from the mockup. A ticket is a form button; the action checks the picked campus is one of the person's school's campuses, writes `campus_person` (insert, or update when changing), and redirects to that campus. The same page serves changing campus: reached from a "Change campus" row in the account card, shown only when the person's school has more than one campus. A person with nothing to choose who opens the page is sent to their campus.

What each ticket says is kept in code beside the school rules (`lib/campus/schools.ts`), by campus slug: title ("Ithaca", "New York"), one line ("The hill, Collegetown, downtown"; "Cornell Tech, Roosevelt Island and the stops around it"), and which engraving (tower, tram). The small line on top is the real count of events on in the next seven days ("Open · N on this week"), not a made-up number. The "Coming soon" names are kept in the same place, by school slug: Cornell → "Weill Cornell Medicine". *My call: only that one is listed; the founder has not named others.*

**D3a. The nearer campus is on top** (founder, 2026-11-18: "put the closer one up top, geolocation or just guess"). The tickets are ordered by distance from where the person seems to be, nearest first. The place is a guess from the request, not the browser's location: the host's own location headers (`x-vercel-ip-latitude`, `x-vercel-ip-longitude`), read on the server. Each campus's centre point is kept with its ticket words. With no guess (local development, a missing header) Ithaca is first. *My call: no location prompt on this screen. Asking for the browser's location before the person has done anything is a heavier ask than the order of two tickets is worth, and the map asks for it later when it matters.* The order is only an order: both tickets are always shown and neither is preselected.

**D4. Cornell Tech is Cornell everywhere else.** Kit: the viewer's kit is the school's slug, so Cornell Tech gets Cornell Coral with no new colours. The door and the sign-in card list schools only (campuses with no parent), so they still show four. `schoolOfEmail` is given schools only.

**D5. Changing campus keeps what you did.** Outings, plans and rewards at the old campus are left as they are. `mayUse` already limits a person to their own campus, so after a change the old campus's screen no longer opens for them. *My call; nothing is deleted.*

**D6. A section's stop.** `Section` gains an optional `stop: { name: string; lines: string[]; area?: string }`. A line is its letter or number; its colour comes from one small table of the lines used (F and M orange). The first New York sections:

| id | name | stop | next |
| --- | --- | --- | --- |
| `roosevelt` | Roosevelt Island | Roosevelt Island (F, M) | `lex63`, `queensbridge` |
| `lex63` | Lexington Av/63 St | Lexington Av/63 St (F, M, Q) | `roosevelt` |
| `queensbridge` | 21 St–Queensbridge | 21 St–Queensbridge (F, M) | `roosevelt` |

One stop is one section, and a section is everything that stop serves (founder, 2026-11-18, after the mockup showed only the campus end of the island: "it's still one train station away"). So Roosevelt Island is one section from the southern tip to the lighthouse, about 3 km long and narrow. The whole section must be in view at the map's furthest zoom, so that zoom is lower here than in Ithaca; the map already works this out from the section's outline. A section is not sized to fit the screen. Every later section follows the same rule: named for its stop, covering what is walked to from it.

Outlines are drawn by hand like Ithaca's and checked on the real map. Sections across the river do not share corners; `wayOn` works from the middles of sections, so that is fine. Which lines stop where must be checked against the MTA's current map before it ships; what is in this table is from memory.

**D7. The station sign.** In `near.tsx`, when the section the way leads to has a stop, the way on is drawn as the sign instead of today's card:
- Open: the arrow, the line bullets, the stop's name, then the neighbourhood and "N on" ("Upper East Side · 3 on"). The neighbourhood is a second optional word on the stop (`area`); without it the line is "N on" alone.
- Greyed (nothing on, not open from here, nothing that way): the same plate in grey, with today's wording, and it is not a button.

Sections with no stop (all of Ithaca) draw exactly what they draw today. The sign's look is the mockup's `.way.a`: near-black plate, white rule across the top, white type, flat hard shadow. It is the one thing on the sheet that is not in the two inks, on purpose. The line colours are fixed colours, not kit colours.

**D8. Events and places.** Places are seeded by the migration for Cornell Tech: Bloomberg Center, Tata Innovation Center, The House, Verizon Executive Education Center, Graduate Roosevelt Island, the Roosevelt Island subway station, the tram station, Four Freedoms Park. Coordinates are looked up, not guessed. The CampusGroups feed is added by the admin on `/c/admin` once its address is found; that page already does this. If Cornell Tech has no public calendar, the campus opens with plans people post and the task is closed saying so.

**D9. The island starts with real things on** (founder, 2026-11-18: the campus must feel "alive"; public feeds and calendars for the island are in, "can be curated for now"). The campus opens with events read from public calendars for Roosevelt Island, beside Cornell Tech's own:
- **Which calendars.** Found in the build and listed for the founder with what each carries: Cornell Tech's CampusGroups and public events calendars, the island's own (the operating corporation's events, the library branch, Four Freedoms Park, the island's community and arts groups), and anything else public that publishes a calendar address. Only a source that offers a calendar feed (iCal) is used; no page is scraped. The reader already takes any calendar address (`lib/campus/import.ts`), so a source is added on `/c/admin`, not in code.
- **Curated for now.** The founder chooses which calendars are on, and hides any event that does not belong, both on `/c/admin` as it works today (a feed can be turned off; an event can be hidden and stays hidden when the feed is read again). Nothing new is built for this. This is for seeding New York; it does not change the no-approval rule for what members post.
- **Places follow the calendars.** After the first read, the place texts that matched no named place are listed, and the ones on the island are added as places, so those events become stamps on the map. This is repeated once per calendar added.
- **Each event keeps its source.** A feed's `source` names where it came from, as "CampusGroups" does today.
- **Nothing invented.** No made-up events, no made-up people going. A count on a ticket or a sign is always real.
- **The two stops next door.** This round seeds the island only. Lexington Av/63 St and 21 St–Queensbridge get events when a calendar that covers them is added or a person posts there; until then their signs are greyed. *My call, from "for the island": say so if those two should be seeded too.*

## Risks / Trade-offs

- [A cornell.edu person at Cornell Tech was already placed at Ithaca] → They stay there until they change it. The account card's "Change campus" is how. No one is moved for them.
- [Some page reads the viewer's campus without the redirect and shows the default campus to someone who has not chosen] → One helper for "the viewer's own campus or go choose", and a test that a not-yet-chosen Cornell viewer is redirected from the campus page.
- [Another session is editing `sections.ts` and `near.tsx`] → Build on the working tree as it stands; do not revert its changes; keep edits to those files small.
- [Line letters and bullet colours look like the MTA's signs] → Plain coloured circles with a letter and a plain plate; no MTA logo, map or typeface.
- [Hand-drawn outlines are off] → Each is checked by screenshot against the map before it ships.

## Migration Plan

One additive migration dated after the newest in `supabase/migrations/` (at the time of writing `20261118600000`): add `campus.part_of`, insert Cornell Tech, insert its places. Written to be run by hand with a lock timeout, as the others are. The founder applies it. Until it is applied nothing changes for anyone: with no second Cornell campus there is nothing to choose. Rollback: delete the Cornell Tech row (its places and anything on it go with it) and drop the column.

## Open Questions

- Which other Cornell schools should be listed as "Coming soon"?
- Does Cornell Tech have a public CampusGroups calendar? To be found in the build.
