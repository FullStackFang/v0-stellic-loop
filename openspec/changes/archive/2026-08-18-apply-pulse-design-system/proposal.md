## Why

The `index.html` demo currently uses a placeholder look (coral `#FF5C3A`, Inter, Tabler icons, flat/no-shadow) and casual copy with emoji. A dedicated **Pulse Design System** now exists (`~/Downloads/Pulse Design System/`, shipped as the `pulse-design` skill): Cornell Big Red carnelian on warm cream, Gabarito/Figtree/IBM Plex Mono type, Lucide icons, soft warm shadows, two themes, and a precise domain vocabulary. Conforming the demo to it makes the on-camera video read as a real, school-branded product and gives the eventual rebuild a design foundation to inherit.

## What Changes

- Replace the ad-hoc palette/type/shape with the design system's **token set** (carnelian accent, cream paper, ink scale, unit/status hues, radii, warm shadow family, motion durations/easings). Values are inlined so the demo stays one self-contained `index.html`.
- Load **Gabarito** (display), **Figtree** (UI/body) and **IBM Plex Mono** (numerals) via Google Fonts; retire Inter as the sole family.
- Swap **Tabler icons for Lucide** (the DS icon set) and follow its semantic map (`repeat`=loop, `radio`=forming/drop, `circle-dot`=intent, `users`=who's in, `zap`=a drop firing, etc.).
- Adopt the DS **domain vocabulary and copy rules**: intents quoted **verbatim, lowercase, unpunctuated**; **rhythm** rendered as one mono line; casual-precise time (`7:30p`, `Tue + Thu`); load-bearing numbers (`N/target`); sentence case; **no emoji anywhere**. **BREAKING (copy):** replace "recurring"/match-adjacent wording and all emoji (👋 👇) with DS microcopy (*fold in*, *drop an intent*, *fires when N want it*).
- Restyle the component set to the DS primitives: **Button, Badge, Chip, Avatar/AvatarStack, LiveDot, Card, Banner, EmptyState, AppHeader, TabBar, Sheet, Toast**, and the domain primitives **LoopCard, IntentCard, RhythmLine, Wordmark**.
- Add the DS **`data-theme="afterdark"` (Big Red Night)** theme with a toggle, per the UI kit's You screen.
- Surface the DS **unit + drop mechanic** where the demo already implies it: proximity unit kicker (dorm floor / class section), a **DropMeter** on forming loops (`8/10 intents · fires when 10 want it`), and "crystallize" framing — replacing the generic "forming" card copy.
- Preserve the existing §5/§9 click-path behavior and all product guardrails (no match list, no intent feed, no browsable profiles, no going/declined grid). This is a restyle + relanguage + drop-surface, not a flow rewrite.

## Capabilities

### New Capabilities
- `design-system-foundation`: The token layer applied inline in `index.html` — color, type + font loading, spacing, radii, warm shadows, motion, the two themes (Daylight + Big Red Night), Lucide iconography, and the no-emoji rule.
- `pulse-brand-language`: The ubiquitous domain vocabulary (intent · unit · drop · loop · owner · rhythm · fold in · crystallize) and the copy/formatting rules — verbatim lowercase intents, mono rhythm lines, casual-precise time, `N/target` numbers, sentence case, microcopy bank — applied to every string in the demo.
- `pulse-ui-components`: The restyled component + screen-chrome inventory (core controls, surfaces, feedback, navigation, and the LoopCard/IntentCard/RhythmLine/Wordmark domain primitives) that the screens are rebuilt from.
- `drop-and-unit-surface`: Surfacing the proximity-unit and drop mechanic in the demo — unit kickers, DropMeter/DropCountdown on forming loops, and crystallize/fold-in language — without adding a feed or profiles.

### Modified Capabilities
<!-- None — openspec/specs/ is empty; this change introduces the first specs. -->

## Impact

- **Files:** `index.html` (the only build artifact) is substantially rewritten in-place — `tailwind.config` theme, the `<style>` token block, font/icon `<link>`s, and every screen/component's classes and copy. No new files ship with the demo; it stays double-click-openable with CDN dependencies only.
- **Dependencies (CDN):** add Gabarito/Figtree/IBM Plex Mono (Google Fonts) and Lucide icons; remove Inter-only and Tabler. React + Tailwind + Babel-standalone remain.
- **Design source:** values are copied/reconciled from `~/Downloads/Pulse Design System/` (tokens + component skeletons). The DS's multi-file CSS/JSX package is **not** linked directly — its token values are adapted into the single file to preserve the record-safe, zero-install demo constraint.
- **Deployment:** re-deploy to the existing Vercel project (`v0-stellic-loop.vercel.app`) after the restyle.
- **Out of scope / guardrails preserved:** no intent feed, no match list, no browsable stranger profiles, no going/declined grid; the §5 click-path and §9 success criteria still pass.
