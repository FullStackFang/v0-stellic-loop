# pulse-ui-components Specification

## Purpose
TBD - created by archiving change apply-pulse-design-system. Update Purpose after archive.
## Requirements
### Requirement: Core controls restyled to DS primitives
The demo SHALL render buttons, icon buttons, badges, chips, avatars, avatar stacks, and live dots per the DS component specs. Primary buttons SHALL be pill-shaped carnelian fills with cream (`--accent-ink`) text and a carnelian glow that drops on press; secondary buttons SHALL be a cream surface with an ink `--border-strong`. Badges SHALL be tiny uppercase (via CSS) status tags in a status hue; chips SHALL be pills. Avatars SHALL show mono initials on a name-hashed tint with a 2px surface ring, and stacks SHALL overlap with a `+N` overflow.

#### Scenario: Primary button
- **WHEN** a primary action button renders
- **THEN** it is a 44px-tall pill with a carnelian background, cream text, and a soft carnelian glow shadow, and on press it darkens to carnelian 600 and drops the glow

#### Scenario: Status badge casing
- **WHEN** a status badge renders (e.g. "Running", "Forming", "Full")
- **THEN** the JSX text is sentence case and the badge is displayed uppercase by CSS in the matching status hue

### Requirement: Surfaces use the card, banner, empty-state, sheet, and toast primitives
The demo SHALL use the DS surfaces: `default` cards (cream, hairline, soft warm shadow, radius ~22px), an `outline` card (ink border, no shadow) for the one subject-of-the-screen surface, `sunken` panels, a `.pls-blush` panel reserved for the single drop moment per screen, inline banners, centered empty states, a bottom **Sheet** with a scrim for compose, and ink toasts. At most one blush panel SHALL appear per screen.

#### Scenario: Subject card is the outline card
- **WHEN** a screen has one focal surface (e.g. the editable spin-up draft)
- **THEN** it uses the outline card variant (1px ink border, no shadow) while other cards use the default variant

#### Scenario: Compose is a bottom sheet
- **WHEN** the student opens the compose/drop-an-intent flow
- **THEN** it presents as a bottom Sheet sliding up from below over a 44% ink scrim with a 2px blur, with a grab handle and a kicker+title header

#### Scenario: Toast style
- **WHEN** a confirmation toast appears
- **THEN** it is an ink pill with cream text and a pop shadow, using a Lucide leading icon (no emoji)

### Requirement: Domain primitives — LoopCard, IntentCard, RhythmLine, Wordmark
The demo SHALL render its loops using a **LoopCard** whose content order is fixed: unit kicker (with a colored dot in the unit hue) → title (Gabarito title-1) → **RhythmLine** → next-session line (a LiveDot when live, else a clock icon) → footer (AvatarStack + "{owner} owns it" / "{n} in" · "{seats} seats left" + action). Any displayed student intent SHALL use an **IntentCard** (verbatim quoted title, author row, unit chip, "{n} want the same" + a "Same" control). Schedules SHALL use the **RhythmLine** mono component. The brand mark SHALL be the type-only **Wordmark** (Gabarito "Pulse" + a carnelian pulse dot), never a drawn logo.

#### Scenario: LoopCard order
- **WHEN** a LoopCard renders
- **THEN** its elements appear in the order unit kicker → title → rhythm line → next line → footer, with the owner named as "{owner} owns it"

#### Scenario: Brand mark
- **WHEN** the app header or splash shows the brand
- **THEN** it renders the Wordmark (Gabarito wordmark + carnelian dot), and no bespoke logo graphic is drawn

### Requirement: Phone-frame chrome — AppHeader, TabBar, FAB
The demo SHALL present as a 390px app frame with a sticky **AppHeader** (~56px) carrying an optional kicker + a title (or the Wordmark) + right-aligned ghost icon buttons, and a bottom **TabBar** (64px, hairline top border) whose active tab shows the glyph in a carnelian-quiet lozenge. A single accent compose **FAB** (`plus`) SHALL float bottom-right. Tap targets SHALL never be below 44px.

#### Scenario: Active tab treatment
- **WHEN** a tab is the active tab in the TabBar
- **THEN** its Lucide glyph sits in a carnelian-quiet pill lozenge with a thicker stroke and accent-deep color

#### Scenario: Compose FAB
- **WHEN** the home/loops screen renders
- **THEN** a carnelian icon-button with a `plus` glyph floats at the bottom-right and opens the compose sheet

