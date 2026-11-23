## Why

A plan a person posts ("Jogging around roosevelt island") only reaches the map when its words happen to name a known place, and posting refuses a plan without a start time. So most people's plans never show on the map, and someone who just wants company has to guess a time before anyone has said yes. The founder approved two mockups (`public/demo/mockups-map-intent.html`, `public/demo/mockups-map-time.html`, 2026-11-23): every plan starts at a public place, and the time can be settled once people are in.

## What Changes

- On a campus where places are required (Cornell Tech first), a person's plan SHALL have a known public place before it can be posted. They pick it from place pills under the line (tabs: Near you, Food, Parks, Sports, Buildings), type its @, or tap its dot on the map. No addresses and no dropped pins. An @ that is not a known place stays a tag, and Post still asks where to meet.
- Every public, named place OpenStreetMap has inside the Roosevelt Island section (35: food and drink, parks, fields, public buildings, the station and the tram) is loaded once into the campus's places, each with a short @name. Missing places are added by hand in the admin's Places tab, as today.
- A plan needs a day. The time is optional: "run @southpoint tomorrow" posts as "Tue ?". A time typed in the line works as today.
- On a plan with no time, "I'm in" asks "When works?" with up to five times for that day. The poster sees how many people (and whose animals) picked each time, with the most picked lit, and presses Send to set it. Nothing is decided automatically.
- A plan with no time stands on its day's map as a white stamp with a red "?". Once the time is set it becomes the usual stamp. A plan whose time is never set leaves the list when its day ends.
- People's plans carry the poster's animal on their map stamp instead of a drawn icon. The source bar over the list gets a "People" part that shows people's plans alone.
- **BREAKING** (Cornell Tech only): posting a plan without a known place is refused there. Plans already posted are unchanged.

## Capabilities

### New Capabilities
- `plan-time-settling`: a plan posted with a day and no time; the "When works?" times offered to people who are in; the poster's counts, pick and send; the plan's look until a time is set and what happens when none is.

### Modified Capabilities
- `member-plans`: posting a plan needs a day and, where places are required, a known place; the start time becomes optional.
- `campus-listings`: a campus's places get short @names and kinds and are loaded from OpenStreetMap; a plan's place is set from its @ or the place picked; places can be required per campus.
- `campus-screen`: the posting panel's place picker and map dots; the "?" stamp; the poster's animal on people's stamps; the "People" part of the source bar.
- `outings`: "I'm in" on a plan with no time opens "When works?".

## Impact

- Database (the founder runs the SQL): `campus_listing.time_open`; a new `campus_time_pick` table; `campus_place.kind`; the 35 Roosevelt Island places for Cornell Tech.
- `lib/campus/line.ts` (a day said with no hour), `lib/campus/plans.ts` (posting with a day only, setting the time), `lib/campus/places.ts` (short @names, kinds, required campuses), `lib/campus/tags.ts` / posting (place from the @), `lib/campus/screen.ts` (ticket fields), `app/c/actions.ts` (post, pick times, send a time), `components/campus/composer.tsx`, `components/campus/screen.tsx`, `components/campus/near.tsx`, `app/c/campus.css`.
- A one-time script to fetch places from OpenStreetMap (the public Overpass API, as `scripts/conga-osm.mjs` does), producing the SQL.
- No new dependencies. Ithaca and other campuses keep today's posting until places are loaded and switched on for them.
