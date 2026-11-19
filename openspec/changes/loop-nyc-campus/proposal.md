## Why

Cornell has people in two towns. Today everyone with a cornell.edu address lands in Ithaca, so a Cornell Tech student on Roosevelt Island sees events and a map five hours away. Loop's point is what is on within a few blocks of you, so the New York campus needs its own week, its own places and its own map, and the map should feel like New York.

## What Changes

- Cornell Tech becomes a second Cornell campus ("New York"), beside Ithaca. Both take cornell.edu addresses. It has its own events, feeds, places, tags and map sections, as every campus already does.
- A cornell.edu person who has not been placed yet is asked once, "Which Cornell?", on a screen of two tickets: Ithaca (stub: the clocktower) and New York (stub: the tram). Cornell schools that are not open yet are listed as "Coming soon" and cannot be picked. Founder picked this layout (A "Two tickets") in `public/demo/mockups-nyc-stops.html`.
- That choice is their own ("home") campus: where they land. They can change it later from their account card.
- A person can look at the other campus of their school without changing their own, from a small luggage tag in the corner of the map (founder's pick in `public/demo/mockups-campus-swap.html`). This part is built.
- People already placed at Ithaca stay there. Nobody is moved.
- The front door still shows four schools. Cornell Tech is part of Cornell, not a fifth school.
- The "Near you" map gets New York sections. One stop is one section (founder, 2026-11-18): all of Roosevelt Island is one section, not the campus end alone. It starts with three: Roosevelt Island, Lexington Av/63 St and 21 St–Queensbridge.
- In New York the way on at the edge of the map is a station sign: a black platform plate with a white rule, the line's coloured bullets and the stop's name. Founder picked this look (A "Station sign") in the same mockup. The rules of the map do not change: one section at a time, the next ones only, a way with nothing on is greyed. Ithaca keeps its arrow.
- Cornell Tech's named places are seeded. The campus opens with real events: Cornell Tech's own calendar where a public one exists, and public calendars for Roosevelt Island, chosen by the founder for now. Nothing is invented.

## Capabilities

### New Capabilities
- `campus-choice`: a school with more than one campus; choosing a campus the first time, the "Coming soon" list, looking at the other campus, and changing campus later.
- `nearby-stops`: a map section that carries its stop and lines, and the station sign shown as the way on between sections.

### Modified Capabilities
- `campus-sign-in`: "A person belongs to the school of their email" changes: when the school has more than one campus the person is not placed by email alone, they choose.

## Impact

- Database: two small additive migrations, no schema change (the Cornell Tech row, written; its places, to write). The founder applies them by hand.
- `lib/campus/people.ts`, `session.ts`, `schools.ts`, `listings.ts`: placement, the viewer, the list of schools.
- `lib/campus/sections.ts`, `components/campus/near.tsx`, `app/c/campus.css`: New York sections and the sign. Another session has uncommitted edits in `sections.ts` and `near.tsx`; work on top of them.
- New page `app/c/choose/`, a new action, and a row in the account card (`components/campus/screen.tsx` or `own-face.tsx`).
- The door (`components/campus/door.tsx`) and kit colours (`app/c/campus.css`, `components/campus/kit.tsx`) must treat Cornell Tech as Cornell.
- No new dependencies.
