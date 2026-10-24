# Spec Delta

## Purpose

The hero names the window the board is looking at: fixed dates for the trip, "next two weeks" for a rolling board.

## MODIFIED Requirements

### Requirement: Hero with live stats
The board SHALL open with the v5 hero: the label "§ 01 · <window name>" with the counts of open and ON proposals, the title "What we could do", one line of copy, and two actions: post an intent and your week. The window name SHALL be the fixed dates (for example "Feb 14–20") on a fixed board and "Next two weeks" on a rolling board. The hero's field SHALL be drawn live (orbit rings, Twist rotation, mesh) and SHALL be still when the viewer prefers reduced motion.

#### Scenario: Counts
- **WHEN** a board has 5 open and 1 ON
- **THEN** the hero label reads "· 5 open · 1 on"

#### Scenario: Rolling label
- **WHEN** a person opens a rolling board
- **THEN** the hero label reads "§ 01 · Next two weeks" followed by the counts, in the same type and spacing as the fixed label

#### Scenario: Long label fits
- **WHEN** a rolling board has 12 open and 3 ON and is viewed at 390px wide
- **THEN** the label "§ 01 · Next two weeks · 12 open · 3 on" sits on one line inside the hero without clipping
