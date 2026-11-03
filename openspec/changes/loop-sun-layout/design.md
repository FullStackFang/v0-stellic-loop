## Context

The app at the repo root is the Quorum proposal board (Next.js 16 App Router, Supabase Postgres, server actions, no client state library). Its screens were ported from `public/demo/quorum.html` v5: cream paper, Source Serif 4 and Geist, a decorative hero, cards with a day-heat grid, In / Maybe / Out, and a human "Lock it in" at quorum. The founder's Loop v1 spec (2026-10-30) asks for three member pages with one primary action each, automatic formation at a threshold, visible failure, and nothing else. On 2026-11-02 and 2026-11-03 the founder approved the Sun look in `public/demo/mockups-sun.html` (plan page, with the hour wheel and weather) and `public/demo/mockups-sun-pages.html` (space page, my plans, didn't form). Those two files are the design reference for this change; where this document and a mockup disagree, the mockup wins.

Constraints: no Docker and no local Supabase (hosted project plus the pglite demo DB from `scripts/local-db.mjs`); auto mode cannot run production migrations, so the founder applies SQL by hand; never emoji; reading must work without JavaScript; the phone-frame-on-laptop shell and the SiteNav menu stay.

## Goals / Non-Goals

**Goals:**
- The plan page, space page and my-plans page match the approved mockups in structure, copy and light, and match spec §7.1 to §7.3 and §7.5 in content.
- One lighting model, shared by the pages and the OG image, driven by the plan's hour and sky, not the viewer's clock.
- Formation needs no human: the response that reaches the threshold forms the plan.
- Failure is visible: "Didn't form · 2 of 4" is a real state with its own page.
- Every removed surface is removed, not hidden: no dead buttons, no second meaning per surface.

**Non-Goals:**
- Recurring crews, weekly instances, "still on?" and "meeting this week". The Formed section shows one-off formed plans in the window.
- WhatsApp or any messaging change. The existing SMS notifier is called at formation as it is called at lock today.
- Join modes, rosters, the steward page, the `/me` and `/s/<token>` routes. Routes stay `/b/<slug>`, `/b/<slug>/you`, `/b/<slug>/new`, `/p/<id>`.
- Touching `public/demo/*`. The mockups stay as the reference.

## Decisions

**D1. One pure lighting module, `lib/solar.ts`, ported line for line from the mockup.** `solar(hour, sky)` returns tint, foreground, shadow offsets and colour, sun and moon positions on the wheel, star depth and the night flag. The wheel is the mockup's: sun at twelve o'clock at noon, moon opposite, ellipse `cx 195, cy 488, rx 220, ry 393` in a 390 by 844 frame, discs fading just below the horizon. Foreground flips to paper when paper has the better WCAG contrast against the tint. The module is unit-tested against values read from the mockup at 6, 12, 18 and 22. Alternative considered: computing light in CSS with `@property` and `calc`. Rejected because the OG image and the tests need the same numbers in TypeScript.

**D2. Lighting is server-rendered as inline custom properties.** The plan page root and every row carry `style` with `--tint --fg --sx --sy --shade --sunx --suny --moonx --moony --night`. Nothing on a page depends on JavaScript to be lit, which keeps "reading never requires auth" and "works without JS". The rain canvas and cloud drift are a small client component layered on top and absent when the viewer prefers reduced motion.

**D3. The hour comes from the existing `time_text`, parsed; the day from a new `proposal.day`.** `lib/hour.ts` parses "6pm", "6:30 pm", "18:00", "noon", "midnight" to a decimal hour; anything else yields 12, the flattest light. Alternative: a new `start_time time` column and a native time input. Rejected for now because the form already takes time as text and the founder's spec lists time as optional free text; a parser is the smaller change. Legacy needs-a-day proposals use their best day as the day.

**D4. The sky comes from a forecast only when the space has a location.** New nullable `board.lat` and `board.lon`; when set, the plan's day within the next 16 days is looked up in Open-Meteo (no key, free) with `fetch` cached for six hours per board and day, and the weather code maps to clear, cloudy or rain. Without a location, or beyond the forecast horizon, or on failure, the sky is clear and the chip shows only the time. Alternative: an inline weather picker on the post form. Rejected: the spec's concept is the real forecast for that day, and a guess would be a lie on the page.

**D5. Formation is the existing `lock_proposal` function, called by the server at threshold.** After `actions/respond.ts` records an `in`, it recomputes `remaining`; at zero it calls `lock_proposal(p_id, person)`, which already serialises concurrent calls, writes `threshold_reached` once and refuses a second call. `locked_by` becomes the person whose tap formed the plan and is not shown. The notifier's `onReached` runs exactly as it does today. The Ask UI, the `lock` action and the "Not yet" reply are deleted. The display state `ready` is folded into `open`.

**D6. Maybe is removed from the product, not from the database.** The `answer` enum keeps `maybe`; the actions reject it, the UI never offers it, existing maybe rows are not shown and do not count. Alternative: a migration to delete maybe rows. Rejected: destructive and unnecessary; those people can tap I'm in.

**D7. Free days stay in the schema and vanish from the pages.** The free-days strip, the per-answer day editor, the heat grid and the conflict line are removed. New posts set `needs_day=false` and store the slot, so the heat logic never runs for them. `lib/quorum.ts` keeps `heat` and `best` for legacy rows. Alternative: drop the columns. Rejected for the same reason as D6.

**D8. Navigation is the header, not a tab bar.** Wordmark "Loop" on the left always links to the space. The right side is a chip: on the space page "Your plans" (to `/b/<slug>/you`), on the plan page and my plans the space name (back to the space). "Post an intent" is a pinned button at the bottom of the space page, members only (signed-in). This settles the founder's open question in favour of the mockups; it is a judgment call and can be reversed in one component (`Shell`).

**D9. Archivo through `next/font/google` with the `wdth` axis.** `Archivo({ axes: ["wdth"], weight: "variable" })`. If next/font cannot expose the width axis, fall back to the self-hosted variable file in `public/fonts/Archivo[wdth,wght].woff2` with one `@font-face`. Implementation uses the self-hosted variable `public/fonts/Archivo.ttf` via `next/font/local`. The OG renderer rejects variable font tables, so it loads an Archivo instance at weight 900 and width 96 from `Archivo-Black.ttf` once at module scope. Both files share the bundled OFL license.

**D10. `globals.css` is rewritten, not patched.** The v5 tokens, hero, card, heat, tabbar and Ask rules go. Sun tokens, the phone frame media block and the SiteNav rules stay or arrive. Class names follow the mockups so a screenshot comparison is one to one.

**D11. One migration, `supabase/migrations/0008_loop_sun.sql`.** `proposal.day date`, `proposal.place text`, `board.lat double precision`, `board.lon double precision`, `board_person.share_with_steward boolean not null default false`, and `board.steward_label text not null default 'the space steward'` (approved during implementation; cohort label `the EMBA office`). The founder runs it on the hosted project; the pglite demo DB picks it up from the migrations folder.

**D12. Didn't form reuses idling.** `stateOf` still returns `idled`; the pages render it as "Didn't form · n of m" with the grey Sun treatment. "Post it again" is the existing fork (`version_of`) with the form prefilled with the title, day, time and place.

## Risks / Trade-offs

- [The width axis does not load through next/font] → D9 fallback to a self-hosted variable file; verified in the first task by a screenshot with the count at width 62.
- [Time text that the parser cannot read lights the page at noon] → the form shows the hint "7:30pm" and the chip still shows the raw text; the parser is unit-tested on the cohort's likely inputs.
- [Paper type over a paper moon after dark] → the night knockout ring from the mockup (1.5px tint ring on head and screen text, none on the chip and the button), checked by screenshot at 21:00 and 03:00.
- [People with a `maybe` answer lose it silently] → they see the open plan with I'm in; counts never included them before.
- [Removing the lock changes who is told what] → the notifier call is unchanged; only the trigger moves from a tap to the threshold. The db test for concurrent formation stays.
- [Open-Meteo is down or slow] → fetch has a 2s timeout and any failure means a clear sky; the page never waits on weather.
- [A space with no location never shows weather] → the chip reads "at 6pm" with the sun glyph; the founder can set lat and lon on the cohort board by SQL.

## Migration Plan

1. Land code and migration together on a branch; the demo DB applies 0008 automatically.
2. Founder applies `0008_loop_sun.sql` on the hosted project before deploy (additive, nullable or defaulted, no data loss).
3. Deploy. Existing proposals render: needs-a-day rows show their best day, maybe answers disappear, idled rows read "Didn't form".
4. Rollback: redeploy the previous build; the added columns are harmless to it.

## Open Questions

- Default threshold stays 4 for the cohort board; the spec's `intent_threshold` per space is not added in this change.
- Cost: kept only as the tail of the where line when `cost_text` exists on legacy rows; new posts do not take it. Confirm with the founder if the February trip needs cost back on the form.
- The wordmark reads "Loop" and the HTML title "Loop"; the repo and the hosted project keep their names.
