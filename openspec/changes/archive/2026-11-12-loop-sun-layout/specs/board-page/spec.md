## MODIFIED Requirements

### Requirement: Sort order
The space page SHALL list open proposals nearest to their threshold first (smallest remaining, ties by newest) under "Open", then formed proposals under "Formed" soonest day first, then idled, past and closed under a folded "Wrapped up" most recent first.

#### Scenario: Ordering
- **WHEN** proposals are A (needs 2 more), B (needs 1 more), C (formed), D (didn't form), E (needs 4 more)
- **THEN** Open lists B, A, E; Formed lists C; Wrapped up lists D

### Requirement: Cards show facts only
Each row SHALL be a block lit by its own plan per `sun-visual-system`: the title uppercase on up to two lines, the when and place line, an optional status line with a dot ("One more and it forms", "You posted this · 9 days left", "<k> of <n> said still on"), a stack of up to five small faces with dashed slots for the places left before the threshold, a weather glyph top right, and on the right the count: a large paper numeral with "/<threshold>" and mini bars for open rows, or "<n>" over "in · join" or "full" for formed rows. A didn't-form row in Wrapped up SHALL read "didn't form · <n> of <m>". Nothing on a row SHALL be a comment, reaction, chat, day grid, heat, cost line, poster name or answer button.

#### Scenario: Open row
- **WHEN** "Overnight boat" is open at 3 of 4 for Fri 20 Feb 6:00pm at Cat Ba pier with a clear sky
- **THEN** the row is coral-orange, shows "3 /4" with three filled mini bars, three faces and one dashed slot, the status "One more and it forms" and a sun glyph

#### Scenario: Formed row
- **WHEN** "Poker" is formed for Sat 9:00pm with six in
- **THEN** the row is ink-blue with paper text, the numeral "6" over "full", six faces, and no bars

## REMOVED Requirements

### Requirement: Hero with live stats
**Reason**: The spec's space page is the space name and its lists; a decorative hero with counts, slogan and orbit field reads as a feed and duplicates "Post an intent".
**Migration**: The counts move to the tag line "Space · <open> open · <formed> formed"; the two hero actions move to the pinned "Post an intent" and the header "Your plans" chip. `components/Hero.tsx` is deleted.

## ADDED Requirements

### Requirement: The space page is the space name and three sections
`/b/<slug>` SHALL render, in order: the header (wordmark, a "Your plans" chip linking to `/b/<slug>/you`), the tag "Space · <open> open · <formed> formed", the space name as the title, a sub line "<members> in the space · open to the cohort · plans form at <threshold>", the section rule "Open" with "forms at <threshold>" on the right, the open rows, the section rule "Formed", the formed rows, a folded "Wrapped up · <k>" line that expands in place to one line per idled, past or closed plan with its state, and a pinned bar with "Post an intent" and "Copy the space link" under it. There SHALL be no tab bar. "Post an intent" SHALL open the post form; without a session it SHALL ask for identity first per `intent-posting`.

#### Scenario: Space page
- **WHEN** a person opens `/b/emba27` with five open and two formed plans and three wrapped up
- **THEN** the tag reads "Space · 5 open · 2 formed", five rows sit under Open, two under Formed, "Wrapped up · 3" is folded, and the pinned button reads "Post an intent"

#### Scenario: Unfold wrapped up
- **WHEN** a person taps "Wrapped up · 3"
- **THEN** three lines appear, for example "Wine night — didn't form · 2 of 4", without leaving the page, and work without JavaScript as a details element

### Requirement: Header navigation replaces the tab bar
Every app page SHALL carry the header: the wordmark "Loop" on the left linking to the space, and one chip on the right: "Your plans" on the space page, the space name on the plan and plans pages. No page SHALL render a bottom tab bar or a "Post" tab.

#### Scenario: From a plan back to the space
- **WHEN** a person taps the "EMBA 2027" chip on a plan page
- **THEN** the space page opens
