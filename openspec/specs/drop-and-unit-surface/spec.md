# drop-and-unit-surface Specification

## Purpose
TBD - created by archiving change apply-pulse-design-system. Update Purpose after archive.
## Requirements
### Requirement: Proximity unit shown on loops and intents
The demo SHALL label each loop and intent with its **proximity unit** — dorm floor, class section, or major — as a uppercase kicker with a color-coded dot (rose = dorm, slate = class, amber = major). Units SHALL replace generic subtitles; the unit hue SHALL appear only on the kicker and its dot.

#### Scenario: Unit kicker on a loop
- **WHEN** a LoopCard for a study loop renders
- **THEN** it shows a unit kicker such as `CS 2110 · SECTION` (class) or `DONLON 2F` (dorm) with a dot in the matching unit hue

### Requirement: Forming loops surface a DropMeter, not a bare "forming" tag
When a loop is forming, the demo SHALL show a **DropMeter** expressing progress toward the drop firing as `N/target intents` with a pill track and tick dividers, plus copy in the form "fires when {target} want it". A forming loop SHALL NOT be shown merely as a generic "forming" chip with no progress.

#### Scenario: Forming loop meter
- **WHEN** a forming loop renders
- **THEN** it shows a DropMeter with `N/target` in mono (e.g. `8/10 intents`), a filled pill track with ticks, and the line "fires when 10 want it"

#### Scenario: Meter fills at target
- **WHEN** a DropMeter's value reaches its target
- **THEN** the count and fill shift to the carnelian "full" treatment

### Requirement: The drop moment uses a single blush panel with a countdown
The demo SHALL present the anticipation of a drop firing in one **blush panel** per screen containing an accent kicker ("Next drop · {unit}"), a short display headline, a **DropCountdown** in mono digit boxes, and a DropMeter. This is the only blush panel allowed on the screen.

#### Scenario: Drop panel
- **WHEN** the home screen shows an upcoming drop
- **THEN** exactly one blush panel appears with a "Next drop · {unit}" kicker, a DropCountdown in zero-padded mono boxes, and a DropMeter

### Requirement: Crystallize and fold-in language for the lifecycle
The demo SHALL describe the loop lifecycle with DS verbs: intents **collect** in a unit, a **drop fires / crystallizes** into a loop when it hits target, and latecomers **fold in** to a running loop. The recurrence payoff SHALL be framed as the same loop still meeting with the same faces (e.g. "Started Week 3 on a pretext · same faces since"), preserving the existing "same avatars" behavior.

#### Scenario: Crystallize on drop
- **WHEN** a forming loop reaches its target in the demo
- **THEN** the copy says the drop **fires** and the loop **crystallizes**, not "matched" or "created an event"

#### Scenario: Recurrence framing
- **WHEN** the recurrence payoff screen renders
- **THEN** the same member avatars return and the copy frames it as the same loop still meeting (e.g. "same faces since"), with no going/declined grid

