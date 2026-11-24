## Context

Events live in `campus_listing` with an origin: `feed` (read from a calendar feed), `hand` (the admin typed it) or `member` (a student posted it). Each has a `going` count already shown to signed-out visitors on the campus list. Places are `campus_place` rows; there are hundreds per campus, loaded from OpenStreetMap, and most have nothing on.

The founder's rules that bind this: the school gate stays; a deal shows only while it runs and only to people near it; feed events show their source name and no link out; the admin's private notes never reach a student.

`app/robots.ts` today only blocks `/b/` and `/p/`. There is no sitemap and no `llms.txt`.

## Goals / Non-Goals

**Goals:**
- Pages an assistant or a search engine can read with no sign-in and no script.
- The same facts on the page, in the guide file's list and from the ask address.
- Nothing about any person on any of them.

**Non-Goals:**
- Showing posted plans, people, faces, groups, deals or rewards.
- A connector, an API key, or anything an assistant has to install. That is `campus-assistant-tools`.
- A page for every place in the database.
- Paid placement or ranking of venues.

## Decisions

**D1. What is public.** A listing is public when its origin is `feed` or `hand`, it is not a deal's day (`deal_id is null`), it is not hidden, cancelled, waiting for review or gone from its feed, and it has not ended. A place is public when it has at least one public listing in the next 14 days, or a record the admin made public. Everything else responds with not found. This keeps the sitemap to pages with something on them. Alternative: a page for every place. Rejected: about 450 thin pages for NYU alone.

**D2. Deals stay off.** The rule "a deal shows only while it runs, only near it" would be broken by a public page listing it all week. Left out for now; see Open Questions.

**D3. What a page says.** Place page: name, campus, walking time from the campus centre when known, this week's public events (day, time, title, host or source name, count going), and the three record numbers when the record is public. Event page: title, day and time, place, host, the "about" text, count going. Each ends with one bar: "Sign in with a school email to see who you know and to go." The count is `listing.going`, the number the signed-out campus list already shows.

**D4. Addresses.** `/places/[campus]/[place]` with the place's tag from `placeTag`; `/events/[id]` with the listing id. Both outside `/c`. Alternative: `/c/[campus]/places/...`. Rejected: `/c` is the gated area and its layout assumes a viewer.

**D5. Readable without script.** Server-rendered HTML, real headings, a `<time>` per event, and schema.org `Place` and `Event` JSON-LD in the head. No client fetch is needed to see any fact.

**D6. The guide file.** `/llms.txt` is a route that returns plain text: one paragraph on what Loopd is, the page patterns, the ask address with its three parameters, and a section on what will not be found. It lists campuses from the database so a new campus appears without a code change.

**D7. The ask address.** `GET /api/ask?near=<campus>&for=<people>&when=<today|tonight|tomorrow|week>` returns JSON: up to 20 public events with title, start, place name, page address and count, soonest first. `for` only filters out places marked for one person; it is otherwise carried back. Unknown campus: an empty list with the campuses that exist. No key, no cookies read, responses cached for five minutes.

**D8. Robots and sitemap.** `app/robots.ts` keeps its two blocks and adds the sitemap line. `app/sitemap.ts` lists public place and event pages. Private records stay out (D3 of `campus-venue-record`).

**D9. Caching.** Pages and the ask address are served from a five-minute cache keyed by address. Counts may lag by that much. This also bounds the cost of a crawler.

**D10. Look.** As the mockup: the app's bar with a Sign in pill, a band in the campus colour with the place name and fact pills, one panel "This week" with event rows and a count pill each, and the dark sign-in bar.

## Risks / Trade-offs

- [A count on a tiny event hints at who went] → It is the count already shown signed out today; no new fact is exposed.
- [Feed text may hold something the host did not mean to be public] → Only feeds the admin turned on are read, and those are public calendars. Events waiting for review are not shown.
- [Crawlers hammer the ask address] → Five-minute cache, a small fixed set of parameter values, and the platform firewall if it comes to that.
- [An assistant states a stale count] → The page and the JSON carry the time they were made.

## Open Questions

- Should a deal appear on its place's public page, in the deal's own words, outside its hours? It would help the venue pitch, but it changes the deals rule. Left out until the founder says.
- Should the walking time be shown when the campus has more than one centre (Cornell Tech and Ithaca are separate campuses, so today this is fine)?
