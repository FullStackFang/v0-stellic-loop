# Spec Delta

## Purpose

One pinnable link per group that shows every intent in the order that matters, in the approved v5 look.

## ADDED Requirements

### Requirement: One stable link per board
Each board SHALL be reachable at `/b/<slug>` with no token in the URL, so the link can be pinned in a chat. The page SHALL render for anyone holding the link.

#### Scenario: Pinned link
- **WHEN** a person opens `/b/emba27` with no cookie
- **THEN** the board renders with all proposals and their counts

### Requirement: Sort order
The board SHALL list open proposals nearest to their minimum first (smallest remaining, ties by newest), then ON proposals, then past and idled. Ready proposals therefore come first within open.

#### Scenario: Ordering
- **WHEN** proposals are A (needs 2 more), B (ready), C (ON), D (idled), E (needs 4 more)
- **THEN** the order is B, A, E, C, D

### Requirement: Hero with live stats
The board SHALL open with the v5 hero: the label "§ 01 · <window name>" with the counts of open and ON proposals, the title "What we could do", one line of copy, and two actions: post an intent and your week. The hero's field SHALL be drawn live (orbit rings, Twist rotation, mesh) and SHALL be still when the viewer prefers reduced motion.

#### Scenario: Counts
- **WHEN** a board has 5 open and 1 ON
- **THEN** the hero label reads "· 5 open · 1 on"

### Requirement: Cards show facts only
Each card SHALL show: a date block (best day, locked day, "No day", or "No days yet"), the plate and title, the facts line (a Ready or On chip, the count, cost, time), the mini heat for open needs-a-day proposals, the ask when ready, the faces and count of people in, and the in / maybe / out actions (in / out and drop for ON). Nothing on the card SHALL be a comment, reaction or chat.

#### Scenario: Ready card
- **WHEN** "Suits" is ready with 6 of 8 on Tue 16
- **THEN** the card shows a carnelian date block "Feb 16 Tue", a Ready chip, "6 of 8 can do Tue", the heat with Tue highlighted, and the ask

#### Scenario: On card
- **WHEN** "Flight" is ON for Thu 18
- **THEN** the card is moss-tinted with a filled date block, an On chip, "5:10am · $90 · Maya locked it", faces, and In / Out

### Requirement: Tapping a card opens the proposal page
Tapping anywhere on a card except its actions SHALL open `/p/<id>`.

#### Scenario: Open detail
- **WHEN** a person taps the title of a card
- **THEN** the proposal page opens
