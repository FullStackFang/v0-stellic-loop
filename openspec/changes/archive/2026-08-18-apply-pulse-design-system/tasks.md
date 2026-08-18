## 1. Foundation — tokens, fonts, icons (design-system-foundation)

- [x] 1.1 Back up the current `index.html` (copy to `index.pre-pulse-ds.html` locally, untracked) so the restyle is trivially reversible.
- [x] 1.2 Replace the Inter `<link>` with one Google Fonts `<link>` for Gabarito (500;600;700;800), Figtree (0,400;0,500;0,600;0,700;1,400) and IBM Plex Mono (400;500) with `display=swap` + `preconnect`.
- [x] 1.3 Add the DS token block to `<style>` as `:root{…}` (colors, semantic, type, radii, warm shadows, motion) using the exact values from design.md D1.
- [x] 1.4 Add `:root[data-theme="afterdark"]{…}` overrides (Big Red Night) per design.md D1.
- [x] 1.5 Rewrite `tailwind.config` colors to reference `var(--…)` (accent/ink/paper/etc.) and remove the coral scale; keep Tailwind for layout only.
- [x] 1.6 Add Lucide via CDN and a small `<Icon name size strokeWidth/>` React wrapper that renders inline SVG inheriting `currentColor`; remove the Tabler webfont link and all `ti-*` classes.
- [x] 1.7 Add a minimal inline-SVG fallback for the glyphs used in the tightest cut so a blocked CDN never yields empty icons. (Implemented as an inline SVG-path map for every glyph used, with the CDN as belt-and-suspenders.)
- [x] 1.8 Add the motion keyframes (`pulse-ring`, `pulse-fold-in`, `pulse-fill`, sheet-up) and wrap all animations in a `prefers-reduced-motion` collapse to ~1ms.

## 2. Core + surface components (pulse-ui-components)

- [x] 2.1 Build `Wordmark` (Gabarito "Pulse" + carnelian pulse dot) and use it on splash + AppHeader; delete the ad-hoc flame-logo treatment.
- [x] 2.2 Build `Button`/`IconButton` (pill; primary=carnelian fill + cream text + glow that drops on press; secondary=surface + ink border; ghost); 44px min tap target.
- [x] 2.3 Build `Badge` (tiny, CSS-uppercased, status hue) and `Chip` (pill, default/accent/static).
- [x] 2.4 Restyle `Avatar` to mono initials on a name-hashed DS tint with a 2px surface ring; keep `AvatarStack` overlap + `+N`.
- [x] 2.5 Build `LiveDot` with the single-instance animated `pulse-ring` halo.
- [x] 2.6 Build `Card` (default / outline / sunken), `Banner`, and `EmptyState` (centered, mechanism copy).
- [x] 2.7 Build the bottom `Sheet` (scrim + 2px blur, grab handle, kicker+title header) and `Toast` (ink pill, cream text, Lucide leading icon).
- [x] 2.8 Build `AppHeader` (sticky ~56px), `TabBar` (64px, hairline, carnelian-quiet active lozenge), and the accent compose `FAB`.

## 3. Domain primitives (pulse-ui-components + drop-and-unit-surface)

- [x] 3.1 Build `RhythmLine` (mono, `repeat` icon + `days · time · place · cadence`).
- [x] 3.2 Build `LoopCard` in fixed order: unit kicker (colored dot) → Gabarito title → RhythmLine → next line (LiveDot if live else clock) → footer (AvatarStack + streak/seniority + action). *(Footer reframed from ownership to streak per §7.)*
- [x] 3.3 Build `IntentCard` (verbatim curly-quoted lowercase intent, author row, unit chip, "{n} want the same" + "Same").
- [x] 3.4 Build `DropMeter` (`N/target` mono header + pill track + tick dividers; carnelian "full" state at target) and `DropCountdown` (zero-padded mono digit boxes).

## 4. Re-skin the screens onto DS chrome (pulse-ui-components, preserve §5 flow)

- [x] 4.1 Splash (S1): Wordmark + tagline + primary "Get started"; carnelian on cream.
- [x] 4.2 Onboarding S2–S4: DS inputs/cards/buttons; email verify, basics, first intent (compose textarea) — behavior unchanged.
- [x] 4.3 Home "Your Pulse" (S5): AppFrame + sticky AppHeader + LoopCards + one blush drop panel (DropCountdown + DropMeter) + bottom TabBar + carnelian FAB opening the compose Sheet.
- [x] 4.4 Suggestions (S6): join → LoopCard; forming → LoopCard with DropMeter ("fires when N want it"); spin-up entry. No feed, no profiles.
- [x] 4.5 Loop detail (S7): outline LoopCard chrome with RhythmLine + AvatarStack + streak/seniority; actions "Fold me in" / "Leave loop"; footer "Pulse keeps the rhythm and the next one." No going/declined grid.
- [x] 4.6 Spin-up (S8): compose Sheet → editable confident draft (LoopCard preview) → "Send it" → Toast/confirmation naming the consequence.
- [x] 4.7 Fold-in (S9): Maya folds in → Toast + Banner "Folded in. …"; loop detail seats her with a "new" marker (no emoji).
- [x] 4.8 Recurrence payoff: same avatars return, framed "same faces since / started on a pretext"; preserve the identical member set.
- [x] 4.9 Add a Big Red Night (`data-theme="afterdark"`) toggle (header + You screen) and verify every screen in both themes.

## 5. Copy pass (pulse-brand-language)

- [x] 5.1 Rewrite all UI strings to sentence case, DS vocabulary (intent/unit/drop/loop/rhythm/fold in/crystallize), and the microcopy bank; buttons verb-first 1–4 words. *(Ownership vocabulary removed per §7.)*
- [x] 5.2 Lowercase all seed-data intents and render them verbatim in curly quotes wherever shown.
- [x] 5.3 Format all schedules as mono rhythm lines and all time as casual-precise (`7:30p`, `Tue + Thu`); progress as `N/target`.
- [x] 5.4 Grep the file: **zero** emoji, and zero occurrences of the forbidden words *match/matching/swipe/connect/network/event* in UI copy.

## 6. Verify + ship

- [x] 6.1 Serve locally (`py -m http.server`) and drive the full click-path in a browser (splash → onboard → suggestions → count-in/fold-in → spin-up → recurrence → fold-in) with **0 console errors**.
- [x] 6.2 Confirm all §9 success criteria still pass and no guardrail is violated (no match list, no intent feed, no browsable profiles, no going/declined grid).
- [x] 6.3 Screenshot each key screen in both Daylight and Big Red Night to confirm the theme swap is complete (no un-themed colors).
- [ ] 6.4 Redeploy to the existing Vercel project and smoke-test the live URL (HTTP 200, renders, no auth wall). **BLOCKED:** Vercel CLI not installed + prod deploy needs user confirmation.
- [x] 6.5 Update `SPEC.md` §3/§4 notes to reflect the adopted design system.

## 7. Product changes from live review (added mid-implementation)

- [x] 7.1 Remove loop **ownership** entirely; replace with non-hierarchical **seniority + streaks** (group `{n}-wk streak`, per-member `wk {joined}`, a neutral "longest streak" flag; no crown, no "owns/coordinates").
- [x] 7.2 Add **private feedback** (like / neutral / dislike) on both people and loops/sessions, in a clearly-labelled "Private · only you see this" surface; nothing punitive; state stays client-side.
- [x] 7.3 Add an emphasized **"Report a safety concern"** flow routing to an assigned counselor (Dana Okafor) — confidential bottom Sheet, per-person flag + loop-level entry + You-screen entry, emergency number.
- [x] 7.4 Add a deterministic **campus-at-scale** mock (~3,128 students) powering **aggregate** momentum only — Home campus strip (`on Pulse · loops running · drops tonight`) and a "Tonight across campus" card (by-category + top study drops). Guardrail preserved: no feed, no stranger profiles.
- [x] 7.5 Add the **You** screen as the Stellic **advising + wellbeing** tie-in: belonging signal (loops → enrollment/advising), assigned counselor + safety, private-notes reassurance, theme toggle.
- [ ] 7.6 Fold §7 changes back into the OpenSpec artifacts (proposal/specs) so the change record stays honest. *(Pending — code landed first for the live review.)*
