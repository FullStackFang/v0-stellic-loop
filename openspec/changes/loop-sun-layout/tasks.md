## 1. Foundations

- [x] 1.1 Write `supabase/migrations/0008_loop_sun.sql`: `proposal.day date`, `proposal.place text`, `board.lat`, `board.lon` (double precision), `board_person.share_with_steward boolean not null default false`; confirm the pglite demo DB applies it and `lib/types.ts` gains the fields
- [x] 1.2 Port `lib/solar.ts` from `mockups-sun.html` (`STOPS`, `WHEEL`, `solar(hour, sky)`, contrast flip, disc visibility) with unit tests pinned to the mockup's values at 6, 12, 18 and 22, clear, cloudy and rain
- [x] 1.3 Write `lib/hour.ts` (time text to decimal hour, 12 on failure) with unit tests for "6pm", "6:30 pm", "18:00", "6.30pm", "noon", "midnight", "after class", ""
- [x] 1.4 Load Archivo with the width axis in `app/layout.tsx` (next/font, or the self-hosted fallback from design D9); set the title to "Loop"; verify by screenshot that the count renders at width 62
- [x] 1.5 Rewrite `app/globals.css` to the Sun tokens and the mockup class names; keep the laptop phone-frame block and the SiteNav rules; delete the v5 hero, card, heat, tabbar and ask rules

## 2. Model and actions

- [x] 2.1 `lib/view.ts`: replace `cardModel` with `planModel` (state open / formed / didnt_form / past / closed, threshold, count, lead words, when line from day + time text or legacy best day, place, faces with first names and the viewer first, dropped-after-formation rows, hour and sky inputs); fold `ready` into `open`; unit tests for each state and for legacy needs-a-day rows
- [x] 2.2 `actions/respond.ts`: accept `in` and `out` only; after an `in`, call `lock_proposal` when remaining is 0; keep the notifier hand-off; tests for the fourth tap forming, concurrent fourth taps (db test), and a rejected `maybe`
- [x] 2.3 Remove the lock entry point (`actions/lock.ts` or its exported action), the `lib/justLocked` flow if it depends on the ask, and the `proposal_reopened` path in `actions/lifecycle.ts`; keep `lock_proposal` in SQL; update tests
- [x] 2.4 `actions/post.ts`: fields title (≤80), day (window date or null), time text, place; set `needs_day=false`; prefill support for "Post it again" with `version_of`; drop icon, cost, min, links, detail; update tests
- [x] 2.5 `actions/details.ts`: poster edits day, time and place on open plans, writing `detail_added`; title fixed; formed plans refuse edits
- [x] 2.6 `actions/settings.ts`: `setShareWithSteward(boardId, bool)` on `board_person`; test default false and toggle
- [x] 2.7 `lib/forecast.ts`: Open-Meteo daily lookup by board lat and lon and plan day, 2s timeout, six-hour cache keyed by board and day, weather-code mapping; returns `{ sky: 'clear' }` without a location or on any failure; unit test the mapping and the fallback

## 3. Shell and shared components

- [x] 3.1 `components/Shell.tsx`: header with the "Loop" wordmark (to the space) and one right chip ("Your plans" on the space page, the space name elsewhere); remove the tab bar; keep `ToastProvider`
- [x] 3.2 `components/Sky.tsx`: server-rendered sky layer (stars svg, sun and moon discs with the crescent bite, cloud) positioned from the solar vars, plus a small client `Rain` canvas and cloud drift that no-op under reduced motion
- [x] 3.3 `components/PlanRow.tsx`: the lit row (title, when and place, status line, face stack with dashed slots, weather glyph, numeral with `/threshold` and mini bars or `in · join` / `full`, didn't-form grey variant); rendering tests for open, formed and didn't form
- [x] 3.4 `components/Faces.tsx` (68px rings, 54px for five or six, "+k more", the dashed "one more" slot) and `components/Count.tsx` (numeral, "of n", lead word, bars); tests for 3 of 4, 5 of 6, seven in
- [x] 3.5 `components/ForecastChip.tsx`: glyph + "<temp>°, <sky> at <time>" or "at <time>"
- [x] 3.6 Delete `Hero`, `Card`, `Ask`, `DayStrip`, `Acts` (replace with `PlanActions`), `PosterControls`, `ShareButton`, `CopyNames`, `MiniHeat`; remove their tests; grep that no import remains

## 4. Pages

- [x] 4.1 Plan page `/p/[id]`: `components/PlanView.tsx` per the plan-page spec: tag, title, when, chip, count, bars, lead, faces, dropped row, details list with the add row for people in, pinned `PlanActions` (I'm in / You're in / Can't make it / Add to calendar), identity step inline on first tap; didn't-form and past variants; inline solar vars on the page root
- [x] 4.2 Space page `/b/[slug]`: `components/SpaceView.tsx` with the tag, name, sub line, Open and Formed sections of `PlanRow`, the `<details>` Wrapped up list, pinned "Post an intent" (signed-in only; otherwise identity first) and "Copy the space link"; empty-space state per board-creation
- [x] 4.3 My plans `/b/[slug]/you`: `components/YourWeek.tsx` with This week, Forming, You posted; the `OptIn` box with the exact copy and switch wired to 2.6; the name switch after it; signed-out line
- [x] 4.4 Post form `/b/[slug]/new`: title, window-day chips, time text with hint, place; prefilled from `?again=<id>`; Sun styling; no native pickers
- [x] 4.5 Home `/` and `StartBoard`: restyle to Sun on paper (no sun), wordmark "Loop"
- [x] 4.6 OG image `lib/og.tsx` and `/p/[id]/og`: title uppercase, "n of m", state, on the plan's tint in Archivo; `/b/[slug]/opengraph-image` on paper with the space name
- [x] 4.7 `components/SiteNav.tsx`: rename Board/Post/You entries to Space / Post / Your plans and add the two Sun mockups under Loop mockups

## 5. Verification

- [ ] 5.1 `npm test` green; `npm run test:db` green against the hosted project (founder task if credentials are needed)
- [x] 5.2 Browser pass with playwright-core at 390px against the demo DB: plan page open, fourth tap forms it, didn't form, past, night (22:00), rain, space page with Wrapped up open, my plans with the toggle on, post form; compare side by side with `mockups-sun.html` and `mockups-sun-pages.html`; no page errors, Archivo loaded, no horizontal scroll at 320px
- [x] 5.3 Fetch each page with JavaScript disabled and confirm the tint, shadow and sun position are in the server HTML
- [x] 5.4 Lighthouse or axe pass on the plan page: contrast at noon and at night, button names, no emoji, reduced-motion check
- [ ] 5.5 Founder applies `0008_loop_sun.sql` on the hosted project, sets lat and lon on the cohort board, and the branch is merged and deployed; confirm the live plan link unfurls with the Sun image
