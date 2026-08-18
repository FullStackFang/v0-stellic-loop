## ADDED Requirements

### Requirement: Carnelian-on-cream color foundation
The demo SHALL use the Pulse Design System color tokens as its only palette: warm **cream** paper neutrals (never pure white except a raised surface), warm near-black **ink** for text, and a single **carnelian** primary accent (carnelian 500 = Cornell Big Red `#B31B1B`). The four supporting hues (rose = dorm, slate = class, moss = running/live, amber = forming) SHALL carry meaning only and never be used decoratively. The prior coral `#FF5C3A` palette SHALL be fully removed.

#### Scenario: Accent color
- **WHEN** any primary button, active control, or brand mark renders
- **THEN** its accent color is carnelian `#B31B1B` (darkening to carnelian 600 on press), and no coral `#FF5C3A` value appears anywhere in the file

#### Scenario: Text on carnelian
- **WHEN** text sits on a carnelian fill
- **THEN** that text is cream, never ink

#### Scenario: Supporting hues are semantic only
- **WHEN** a unit hue (rose/slate) or status hue (moss/amber) appears
- **THEN** it appears only on a unit kicker/dot or a status badge/dot/meter, never as a surface fill or decoration

### Requirement: Type system with three families
The demo SHALL set headings/titles/hero/drop lines in **Gabarito** (700/800), body/labels/kickers in **Figtree** (400/500/600), and counts/countdowns/timestamps in **IBM Plex Mono** (tabular numerals). IBM Plex Mono SHALL never be used for a heading. Body text SHALL be ≥ 13.5px and kickers ≥ 11.5px. Inter SHALL no longer be the sole family.

#### Scenario: Fonts load
- **WHEN** the page loads
- **THEN** Gabarito, Figtree, and IBM Plex Mono are requested from Google Fonts and applied to their respective roles

#### Scenario: Numerals are mono
- **WHEN** a count, countdown, or timestamp renders (e.g. `8/10`, `7:30p`)
- **THEN** it is set in IBM Plex Mono with tabular numerals

### Requirement: Shape and warm-shadow depth
The demo SHALL express depth through hairline borders and the DS's single soft, **warm-tinted** shadow family (mixed from `rgba(94,50,38,…)`, not neutral black), not through flat borders alone or hard/offset shadows. Radii SHALL follow the DS scale (badge/checkbox 5px, fields/banners 12px, cards 14px, blush panels 24px, sheet top 28px, pill for buttons/chips/avatars). Carnelian primaries SHALL carry a colored glow that drops on press.

#### Scenario: Card elevation
- **WHEN** a default card renders
- **THEN** it is a cream surface with a 1px hairline, a soft warm shadow, and a 14px radius

#### Scenario: No hard shadows
- **WHEN** any elevated surface renders
- **THEN** no hard-edged, offset, or neutral-black shadow is used

### Requirement: Two themes (Daylight and Big Red Night)
The demo SHALL default to the **Daylight** theme (cream paper) and SHALL provide a **Big Red Night** theme via `data-theme="afterdark"` on the root, which swaps cream for warm charcoal and lifts carnelian to a brighter shade for contrast while keeping it the accent. A visible control SHALL toggle between the two.

#### Scenario: Toggle to afterdark
- **WHEN** the user activates the theme toggle
- **THEN** `data-theme="afterdark"` is set, backgrounds become warm charcoal, carnelian brightens, and shadows go near-black with structure carried by hairlines

### Requirement: Lucide iconography, no emoji
The demo SHALL use **Lucide** outline icons (2px round-cap stroke, `currentColor`) following the DS semantic map (`repeat` = loop, `radio` = forming/drop, `circle-dot` = intent, `users` = who's in, `clock`/`calendar` = rhythm, `house` = dorm unit, `book-open` = class unit, `graduation-cap` = major unit, `zap` = a drop firing, `plus` = drop an intent). Tabler icons SHALL be removed. **No emoji** SHALL appear in UI, copy, or as icons.

#### Scenario: Icon set
- **WHEN** any icon renders
- **THEN** it is a Lucide glyph inheriting `currentColor`, and no Tabler `ti-*` class remains

#### Scenario: No emoji anywhere
- **WHEN** any screen or string renders
- **THEN** it contains no emoji characters (the prior 👋 and 👇 are removed); the only non-icon glyphs allowed are the middot `·`, the em dash, and curly quotes

### Requirement: Calm, token-driven motion
The demo SHALL use the DS motion scale — ~120ms for control color/border, ~180ms for toggle knobs, ~260ms for a sheet settling from below, ~420ms for a meter fill — with the DS easings. At most **one** looping animation (a `pulse-ring` on a single live dot) SHALL run per screen, and lists SHALL fold in with a short rise+fade never staggered past 3 items. All motion SHALL collapse to ~1ms under `prefers-reduced-motion`.

#### Scenario: Reduced motion
- **WHEN** the user prefers reduced motion
- **THEN** animations collapse to ~1ms and no looping animation runs
