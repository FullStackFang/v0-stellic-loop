## Context

The demo is a single self-contained `index.html` (React 18 UMD + Tailwind Play CDN + Babel-standalone, classic JSX runtime) that must stay double-click-openable and record-safe on camera. The Pulse Design System is a multi-file package (`tokens/*.css`, `components/**/*.jsx`, `ui_kits/`) built to be linked via `styles.css` (`@import` chain) and consumed as `.pls-*` classes + inline styles that read CSS custom properties. We cannot link that package directly without breaking the "one file, zero install" constraint. So the design question is: how do we get the DS's exact look and language into one HTML file while keeping the existing §5 click-path and §9 guardrails intact.

Exact source values are captured in the digest below (Decisions → Token block); the files of record are `~/Downloads/Pulse Design System/tokens/*.css` and the component `.jsx` skeletons.

## Goals / Non-Goals

**Goals:**
- Reproduce the DS look exactly: carnelian-on-cream, Gabarito/Figtree/IBM Plex Mono, Lucide icons, warm soft shadows, pill controls, the two themes.
- Adopt the DS vocabulary and copy rules on every string; remove all emoji.
- Surface the unit + drop mechanic (unit kickers, DropMeter, DropCountdown, blush drop panel) where the demo already implies forming/recurrence.
- Keep the demo one self-contained `index.html`; keep the §5 click-path and §9 success criteria passing; keep all product guardrails.

**Non-Goals:**
- Importing or bundling the DS package files, or self-hosting fonts (Google Fonts `@import` is fine for the demo).
- Building the full component library or every DS screen (You screen, waitlists, etc.) — only what the click-path needs.
- Changing the flow/state machine or adding a feed, profiles, or a going/declined grid.
- Layer B (Claude API parse) — still out.

## Decisions

### D1 — Inline the token layer as a `:root` CSS variable block; keep Tailwind for layout only
Copy the DS semantic tokens verbatim into a `<style>` `:root{…}` block and redefine them under `:root[data-theme="afterdark"]`. Continue using Tailwind utility classes for layout/spacing, but drive **all color, radius, shadow, and font** decisions through the CSS variables (via `style={{…}}` or small utility classes like `.pls-card`, `.pls-btn`). Map the few Tailwind theme colors we still reference to `var(--…)` in `tailwind.config`.
- *Why over alternatives:* Linking `styles.css` breaks single-file/zero-install. Rewriting everything as pure Tailwind arbitrary values would scatter the palette and lose the theme swap. A `:root` var block is the DS's own mechanism, gives us the afterdark toggle for free (redefine vars, no per-component dark classes), and is the smallest faithful port.

**Token block to inline (light/default):**
```
--paper-0:#fffdf8; --paper-1:#f9f4ec; --paper-2:#f0e8da; --paper-3:#e3d8c6;
--ink-0:#1f1a17; --ink-1:#352d28; --ink-2:#6a5e56; --ink-3:#98897e; --ink-4:#c5b8aa;
--carnelian-100:#f8e6e3; --carnelian-200:#f0c5c0; --carnelian-300:#e08d84; --carnelian-400:#cf5347;
--carnelian-500:#b31b1b; --carnelian-600:#8a1414; --carnelian-700:#680f0f;
--moss-500:#3d8a5f; --amber-500:#b6862b; --amber-600:#8a641f; --rose-500:#a04f6a; --slate-500:#59657a;
/* semantic */
--bg-page:var(--paper-1); --bg-surface:var(--paper-0); --bg-raised:#fffefb; --bg-sunken:var(--paper-2);
--bg-blush:var(--carnelian-100); --bg-inverse:var(--ink-0); --bg-scrim:rgba(31,26,23,.44);
--text-primary:var(--ink-0); --text-secondary:var(--ink-2); --text-tertiary:var(--ink-3);
--text-inverse:var(--paper-0); --text-link:var(--carnelian-600);
--border-hairline:var(--paper-3); --border-strong:var(--ink-0); --border-quiet:rgba(31,26,23,.08);
--accent:var(--carnelian-500); --accent-strong:var(--carnelian-600); --accent-quiet:var(--carnelian-100); --accent-ink:var(--paper-0);
--status-live:var(--moss-500); --status-forming:var(--amber-500); --status-full:var(--carnelian-500);
--unit-dorm:var(--rose-500); --unit-class:var(--slate-500); --unit-major:var(--amber-600);
--focus-ring:var(--carnelian-500);
/* type */
--font-display:'Gabarito',system-ui,sans-serif; --font-sans:'Figtree',system-ui,sans-serif; --font-mono:'IBM Plex Mono',ui-monospace,monospace;
/* radii */ --radius-md:14px; --radius-lg:22px; --radius-xl:28px; --radius-2xl:34px; --radius-pill:999px;
/* shadows (warm) */
--shadow-card:0 1px 2px rgba(80,40,30,.05),0 4px 14px -10px rgba(80,40,30,.14);
--shadow-raised:0 8px 26px -12px rgba(80,40,30,.2); --shadow-pop:0 28px 60px -24px rgba(80,40,30,.3);
--glow-accent:0 6px 18px -10px var(--carnelian-500);
/* motion */ --dur-1:120ms; --dur-2:180ms; --dur-3:260ms; --dur-4:420ms;
--ease-out:cubic-bezier(.2,.8,.2,1); --ease-settle:cubic-bezier(.16,1,.3,1); --ease-pop:cubic-bezier(.34,1.56,.64,1);
```
**afterdark overrides** (`:root[data-theme="afterdark"]`): `--bg-page:#181310; --bg-surface:#211a16; --bg-raised:#2a221d; --bg-sunken:#12100c; --bg-blush:#2c1815; --text-primary:#f8f1e8; --text-secondary:#bcafa2; --text-tertiary:#8d8074; --border-hairline:#342a24; --border-strong:#4e4139; --border-quiet:rgba(248,241,232,.1); --accent:var(--carnelian-400); --accent-strong:var(--carnelian-300); --accent-quiet:rgba(207,83,71,.16); --accent-ink:#1a0d0b; --focus-ring:var(--carnelian-300); --shadow-card:0 1px 2px rgba(0,0,0,.4); --shadow-raised:0 8px 26px -12px rgba(0,0,0,.7); --shadow-pop:0 28px 60px -24px rgba(0,0,0,.8);`

### D2 — Fonts via one Google Fonts `<link>`; retire Inter
Replace the Inter link with: `Gabarito:wght@500;600;700;800`, `Figtree:ital,wght@0,400;0,500;0,600;0,700;1,400`, `IBM+Plex+Mono:wght@400;500`, `display=swap`. Roles: Gabarito = titles/hero/wordmark; Figtree = body/labels/kickers; IBM Plex Mono = counts/countdowns/timestamps/rhythm lines/avatar initials only.
- *Why:* Matches the DS exactly; one request; `display=swap` avoids invisible text on camera.

### D3 — Lucide icons via CDN, replacing Tabler
Load Lucide from CDN and render inline SVG inheriting `currentColor`. Simplest faithful path: use the `lucide` UMD build and a tiny `<Icon name size/>` React wrapper that reads `lucide.icons[name]` (or `data-lucide` + `lucide.createIcons()` after render). Follow the DS semantic map (`repeat`=loop, `radio`=forming/drop, `circle-dot`=intent, `users`=who's in, `zap`=drop firing, `plus`=compose, `house`/`book-open`/`graduation-cap`=unit types, `clock`/`calendar`=rhythm, `chevron-*`, `x`, `send`, `search`, `bell`, `circle-check-big`).
- *Why over keeping our SVG avatars/hand-rolled icons:* the DS is explicit that icons are Lucide and screens never hand-draw glyphs; a CDN + wrapper keeps single-file. Avatars stay as our inline-SVG initials component (DS Avatar is also initials-on-tint), restyled to mono initials + name-hashed DS tints + 2px surface ring.

### D4 — Port only the components the click-path needs, as small inline React components
Rebuild these to DS specs: Wordmark, Button/IconButton, Badge, Chip, Avatar/AvatarStack, LiveDot, Icon, Card (default/outline/sunken), Banner, EmptyState, Sheet, Toast, DropMeter, DropCountdown, AppHeader, TabBar, LoopCard, IntentCard, RhythmLine. Skip DS components the demo doesn't use (Select, SegmentedControl unless the Your-loops/Nearby split is kept, Switch except the theme toggle).
- *Why:* Surgical — the digest gives exact skeletons; we only pay for what's on camera.

### D5 — Map the existing screens onto DS chrome, preserving flow
Keep the state machine and §5 arc. Re-skin: splash → Wordmark + tagline; onboarding → DS inputs/cards; **Home ("Your Pulse")** → AppFrame + sticky AppHeader (Wordmark + ghost icon buttons) + compose entry that opens a **Sheet** ("Drop an intent") + LoopCards + one blush drop panel (DropCountdown + DropMeter) + bottom TabBar + carnelian FAB. Suggestions → LoopCard(join) / DropMeter(forming) / spin-up; Loop detail → outline LoopCard with RhythmLine + AvatarStack, "Fold me in"/"Leave loop"; Spin-up → Sheet draft; Fold-in → Toast + Banner with "folded in" copy; Recurrence → same avatars + "same faces since". Add a **Big Red Night** toggle (in a lightweight You affordance or the header) to demo the second theme.
- *Why:* Satisfies `pulse-ui-components` + `drop-and-unit-surface` while keeping §9 criteria and guardrails.

### D6 — Rewrite every string to DS copy rules
Intents rendered verbatim/lowercase in curly quotes; rhythm as one mono line (`Thu · 7:00p · Mann · weekly`); time casual-precise (`7:30p`, `Tue + Thu`); numbers as `N/target`; sentence case; **no emoji** (remove 👋/👇); confirmations name the consequence ("Folded in. …"). Seed data intents get lowercased.
- *Why:* This is the single most identity-defining part of the DS; cheap to do alongside the re-skin.

## Risks / Trade-offs

- **Lucide CDN dependency could fail on camera** → keep a minimal inline-SVG fallback for the ~12 glyphs the tightest cut uses (splash → suggestions → fold-in → recurrence), so a blocked CDN never yields empty icons. Serving locally (`py -m http.server`) already de-risks this vs `file://`.
- **Three font families increase load and FOUT risk** → `display=swap` + `preconnect`; the phone frame's first paint (splash Wordmark) is Gabarito only, which loads fast.
- **Tailwind Play CDN + CSS-variable palette can drift** (utilities still emit their own colors) → forbid Tailwind color utilities for anything themable; use `var(--…)` via `style`/`.pls-*` classes so the afterdark swap stays complete.
- **Scope creep from the drop mechanic** → cap it: unit kickers + one DropMeter on forming + one blush drop panel + copy. No new screens, no waitlist flow.
- **Restyle could regress the verified §9 path** → re-run the same browser click-path verification after the re-skin (splash → onboard → suggestions → fold in → spin-up → recurrence → fold-in) and confirm 0 console errors before redeploying to `v0-stellic-loop.vercel.app`.
- **"Throwaway demo" vs full DS investment** → accepted: the user wants the video to look real and the rebuild to inherit a foundation; we still keep it one file so it stays disposable.

## Migration Plan

1. Land the token block + fonts + Lucide wrapper; verify splash renders in both themes.
2. Re-skin screens in §5 order behind the existing state machine (no flow changes).
3. Rewrite copy + seed intents to DS rules; grep the file for emoji and forbidden words (match/swipe/connect/event) → zero hits.
4. Re-run the browser click-path verification (0 console errors, all §9 criteria) — rollback is trivial (single file; keep a copy of the pre-restyle `index.html`).
5. Redeploy to the existing Vercel project.

## Open Questions

- Keep the "Your loops / Nearby" SegmentedControl split from the DS loops screen, or keep the demo's single-column Home? (Leaning: keep single-column Home to protect the §5 cut; borrow the blush drop panel only.)
- Surface the theme toggle in a minimal "You" tab vs a header icon? (Leaning: header icon for fewer taps on camera.)
- How many seeded forming loops get a DropMeter (one hero vs several)? (Leaning: one hero forming loop with a live meter.)
