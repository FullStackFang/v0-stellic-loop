## 1. What is public (`lib/campus/public.ts`)

- [x] 1.1 Tests first, in `lib/__tests__/campus-public.test.ts`, for "Which events are public": feed, hand, member plan, waiting, hidden, cancelled, left the feed, ended, a deal's day.
- [x] 1.2 `publicEvents(q, campus, { from, to, placeId? })`, `publicEvent(q, id)`, `publicPlace(q, campusSlug, placeTag)` and `publicPlaces(q, campus)` (places with an event in 14 days or a public record). Return plain facts only: no `posted_by`, no notes.
- [x] 1.3 A test that serialises every return value and finds no person id, name or note from the fixtures.

## 2. The pages

- [x] 2.1 Read the Next.js guides this needs in `node_modules/next/dist/docs/` (dynamic routes, caching and revalidation, metadata, `sitemap` and `robots` files, route handlers) before writing any route.
- [x] 2.2 `app/places/[campus]/[place]/page.tsx`: band, fact pills, "This week" panel with event rows and count pills, record numbers when public, the sign-in bar. Not found per the spec.
- [x] 2.3 `app/events/[id]/page.tsx`: the event's facts, its count, the source named with no link out, the sign-in bar.
- [x] 2.4 schema.org `Place` and `Event` JSON-LD on each; a `<time datetime>` per event; a "made at" time.
- [x] 2.5 Styles to match `public/demo/mockups-six-adds.html` section 5. Every control a pill; no bare labels on a panel; one column on a phone.
- [x] 2.6 Five-minute cache on both pages.
- [x] 2.7 Page tests: facts present in the HTML without script; not found cases; the same HTML signed in and signed out; Sign in returns to `/c/[campus]`.

## 3. For assistants and search

- [x] 3.1 `app/llms.txt/route.ts`: plain text built from the campuses in the database. Test: names each campus, the page patterns and `/api/ask`.
- [x] 3.2 `app/api/ask/route.ts`: the three parameters, 20 events at most, five-minute cache, reads no cookies. Tests: tonight, unknown campus, no parameters, a bad `for`.
- [x] 3.3 `app/sitemap.ts` listing public places and events. Test: no `/c/` address, no private record.
- [x] 3.4 `app/robots.ts`: keep the `/b/` and `/p/` blocks, add the sitemap. Test.

## 4. Check and land

- [x] 4.1 Run only the affected tests with `--maxWorkers=3`, then eslint and `tsc --noEmit`.
- [x] 4.2 On the dev server, fetch a place page, an event page, `/llms.txt` and `/api/ask` with `curl` (no script, no cookies) and read what comes back.
- [ ] 4.3 One production build at the end, with the dev server stopped, since new routes ship.
- [x] 4.4 Commit on local main (no push).
- [ ] 4.5 (Founder) After publishing, paste a place page address into an assistant and ask it the mockup's question, to see what it reads.
