## Why

The founder's "Loop v1 Specification" (2026-10-30) is now the layout source of truth, and the current Quorum screens only partly follow it: a decorative hero and three-tab bar, a day-heat grid and a three-way In / Maybe / Out answer, a human "It's on" lock, no "3 of 4" progress, no visible "Didn't form" state, and a profile-shaped You page without the steward opt-in. On 2026-11-02 and 2026-11-03 the founder approved a new visual system, Sun, in two clickable mockups (`public/demo/mockups-sun.html` for the plan page, `public/demo/mockups-sun-pages.html` for the space page, my plans and the didn't-form state), replacing the v5 cream look for Loop. This change brings the three member pages into the spec's shape and the approved look in one pass, so the EMBA 2027 cohort gets the minimal product the spec describes.

## What Changes

- **Sun visual system** replaces the v5 cream system on every app page: one typeface (Archivo, variable width and weight), ink `#1a1612` on paper `#fffdf7`, flat hard shadows, no blur, no gradients, no emoji. The plan page is drenched in a tint set by the plan's hour and that day's sky: the sun and moon ride one wheel that turns once a day, shadows swing with whichever is up, type flips to paper after dark, stars on a clear night, a cloud or rain when the forecast says so. Space and my-plans rows are blocks lit the same way, one per plan.
- **Plan page** `/p/<id>` becomes the spec's §7.1 page: title, when and where, forecast chip, the count as "3 of 4" with bars, first-name faces up to six, one primary button (I'm in / You're in), one low-emphasis secondary (Can't make it / Add to calendar), shared details as a read list, and a "Part of {space}" chip. **BREAKING**: the day-heat grid, Maybe, the Ask block, Share / Post a version / Copy names, Back to the board, cost in the meta line and poster controls leave the page.
- **Formation is automatic**: the response that reaches the threshold forms the plan; nobody locks it. **BREAKING**: the "Lock it in / It's on" ask is removed. The existing notifier runs once at formation as it does today at lock.
- **Intents carry a slot**: the post form is title, day, time, place (spec §5.1). **BREAKING**: icon picker, cost, minimum, links and the "Needs a day" switch leave the form; the threshold is the space default. Free days and day heat are no longer shown anywhere; existing needs-a-day proposals keep working with their best day shown as the slot.
- **Space page** `/b/<slug>` becomes §7.2: space name, sub line, Open rows (count toward threshold, faces, status line), Formed rows, a folded "Wrapped up" list that names "didn't form · 2 of 4", and one pinned "Post an intent". **BREAKING**: the hero with live stats, the orbit canvas, the Post tab and the three-tab bar are removed; navigation is the header (wordmark to the space, a "Your plans" link).
- **My plans** `/b/<slug>/you` becomes §7.3 and §7.5: this week's formed plans you are in, the open ones you are in, the ones you posted, and the steward opt-in toggle with the spec's exact copy, off by default. **BREAKING**: the free-days strip and the "Your week" headline go; the name switch stays below the opt-in.
- **Didn't form is visible**: an open intent past its deadline renders as "Didn't form · 2 of 4" in flat grey with no sun, the people who were in still named, and one action, "Post it again", which opens the post form prefilled with the title.
- **Forecast** (last, optional): when a space has a location, the plan's day is looked up once in Open-Meteo and mapped to clear / cloudy / rain; otherwise the sky is clear and only the hour lights the page.

## Capabilities

### New Capabilities
- `sun-visual-system`: tokens, type, the solar wheel, shadows, night mode, weather, motion and reduced-motion rules for every app page.
- `plan-page`: what the plan page shows in each state (open, formed, didn't form, past) and its one primary action.
- `my-plans-page`: the per-space "your plans" page and its three lists.
- `steward-opt-in`: the per-member share flag, its default, its copy and where it is shown.
- `intent-slot`: day, time and place on an intent, how they are posted, edited and rendered, and how the hour drives lighting.

### Modified Capabilities
- `board-page`: hero and live stats removed; the page is the space name plus Open, Formed and folded Wrapped up sections of lit rows; one pinned Post an intent; no tab bar.
- `quorum-and-lock`: the ask and manual lock are replaced by automatic formation at quorum; "idled" is rendered as "Didn't form · n of m"; reopen at a lower number is removed.
- `intent-posting`: the form is title, day, time, place; cost, minimum, icon, links and needs-a-day are no longer posted; "Post a version" becomes "Post it again" from a didn't-form plan.
- `intent-response`: answers are in or out only; Maybe is removed; names are first names.
- `free-days`: free days and day heat are not collected or shown on any page; conflicts are no longer computed for display.
- `design-system-foundation`: its requirements now apply to the Quorum prototype under `/demo/quorum` only; app pages follow `sun-visual-system`.
- `board-creation`: "New screens use only the v5 system" becomes "use only the Sun system".

## Impact

- `app/layout.tsx` (Archivo via next/font, title "Loop"), `app/globals.css` (rewritten to Sun tokens), `app/page.tsx`, `app/b/[slug]/page.tsx`, `app/b/[slug]/you/page.tsx`, `app/b/[slug]/new/page.tsx`, `app/p/[id]/page.tsx`, `app/p/[id]/og/route.tsx` and `lib/og.tsx` (OG image restyled).
- `components/`: `Shell`, `Hero`, `Card`, `BoardView`, `ProposalView`, `YouView`, `Acts`, `Ask`, `DayStrip`, `DetailsBox`, `PostForm`, `PosterControls`, `ShareButton`, `CopyNames` are replaced or removed; new `Sky`, `PlanRow`, `Count`, `Faces`, `ForecastChip`, `OptIn`.
- `lib/view.ts`, `lib/quorum.ts` (auto-formation, didn't-form), new `lib/solar.ts` (the wheel, shared with the OG image), new `lib/hour.ts` (time text to hour), `actions/respond.ts` (form on threshold, no maybe), `actions/post.ts` (slot fields), `actions/settings.ts` (opt-in), `actions/lock.ts` (removed or internal).
- Database: one migration adding `proposal.day`, `proposal.place` and `board_person.share_with_steward`; the founder applies it by hand (auto mode blocks production migrations). `lock_proposal` stays as the formation primitive, called by the server at threshold.
- Tests: `components/__tests__`, `lib/__tests__`, `actions/__tests__` and `supabase/tests` updated for the new states and the removed answers.
- `components/SiteNav.tsx` menu entries updated; `public/demo/*` untouched.
- Out of scope, left for later changes: recurring crews and "meeting this week", WhatsApp messaging, join modes and rosters, the steward page, the `/me` and `/s/<token>` routes from the spec.
