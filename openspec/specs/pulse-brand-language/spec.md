# pulse-brand-language Specification

## Purpose
TBD - created by archiving change apply-pulse-design-system. Update Purpose after archive.
## Requirements
### Requirement: Ubiquitous domain vocabulary
Every user-facing string in the demo SHALL use the Pulse vocabulary in its defined sense: **intent, unit, drop, loop, owner, rhythm, fold in, crystallize**. The demo SHALL NOT use any of the forbidden words — *match, matching, swipe, connect, network, event* — in UI copy. A person joining an existing loop SHALL be described as "folding in", never "joining" or "matching".

#### Scenario: Fold-in language
- **WHEN** a latecomer (Maya) is added to a running loop
- **THEN** the copy says she "folded in" (e.g. "Folded in. …"), and no "match"/"joined"/"connect" wording appears

#### Scenario: Forbidden words absent
- **WHEN** any screen renders
- **THEN** none of the strings contain *match, matching, swipe, connect, network,* or *event*

### Requirement: Intents quoted verbatim, lowercase, unpunctuated
When the demo displays a student's intent text, it SHALL render it **exactly as typed** inside curly quotes — lowercase, unedited, unpunctuated — and SHALL never capitalize, correct, summarize, or add terminal punctuation to it.

#### Scenario: Intent echo
- **WHEN** the spin-up or suggestions screen echoes the student's intent
- **THEN** the intent appears in curly quotes verbatim and lowercase (e.g. `"lock in for cs 2110 before hw2"`), not Title Cased or summarized

### Requirement: Rhythm rendered as one mono line
A loop's schedule SHALL be rendered as a single **rhythm line** in IBM Plex Mono: days · time · place · cadence, using middot separators, casual-precise time (`7:30p`, not `7:30 PM`), and compact day tokens (`Tue + Thu`, not `Tuesdays and Thursdays`).

#### Scenario: Rhythm line format
- **WHEN** a loop card or loop detail shows its schedule
- **THEN** it is one mono line such as `Thu · 7:00p · Mann · weekly` with middot separators and casual-precise time

### Requirement: Load-bearing numbers as N/target
Quantities SHALL be shown as countable specifics rather than adjectives, and progress SHALL always be `N/target` (e.g. `8/10 intents`, `2 more and this drop fires`, `3 seats left`). Counts, countdowns, and timestamps SHALL be mono.

#### Scenario: Progress format
- **WHEN** a forming loop shows how close it is to firing
- **THEN** it reads as `N/target` (e.g. `8/10 intents · fires when 10 want it`), not "almost there" or a bare percentage

### Requirement: Sentence case, no exclamation, no emoji, confirmations name the consequence
All copy SHALL be sentence case (badges are uppercased by CSS, not by the writer; kickers are the only uppercase text, via CSS). Copy SHALL contain no exclamation marks and no emoji. Confirmations SHALL name the human consequence rather than saying "Success!". Empty states SHALL describe the mechanism rather than apologize.

#### Scenario: Confirmation copy
- **WHEN** an action completes (folding in, dropping an intent, sending a loop)
- **THEN** the confirmation names the consequence (e.g. "Folded in. Nadia knows you're coming." / "Dropped. It waits with 3 others on your floor.") — not "Success!" — with no emoji and no exclamation mark

#### Scenario: Empty state copy
- **WHEN** a surface has nothing to show yet
- **THEN** it explains the mechanism (e.g. "Nothing forming on your floor yet. Drop an intent and it waits here until enough people want the same thing.") rather than apologizing

### Requirement: Microcopy bank for controls
Control and label copy SHALL be drawn from the DS microcopy bank where applicable: *Drop an intent · Fold me in · I want this too · Same · See what's forming · Fires when N want it · Started Week 3 on a pretext · Same faces since · Leave loop.* Buttons SHALL be 1–4 words, verb-first; badges 1–3 words.

#### Scenario: Primary controls use the bank
- **WHEN** the compose control and the fold-in control render
- **THEN** they read "Drop an intent" and "Fold me in" (or "I want this too"), verb-first and sentence case

