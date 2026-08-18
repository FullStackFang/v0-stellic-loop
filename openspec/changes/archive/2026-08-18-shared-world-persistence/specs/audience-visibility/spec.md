## ADDED Requirements

### Requirement: Loops and intents declare an audience

Each loop and intent SHALL declare an `audience` describing who it is visible to. Supported scopes SHALL include at least: `campus` (everyone), `north` (North Campus cohort), `major` (a named major), `class` (a named course), `dorm` (a whole building), and `floor` (a specific floor). A compatibility shim (`inferAudience`) SHALL derive an audience for any un-annotated seed loop so no existing data crashes the filter.

#### Scenario: Seed loops resolve to an audience

- **WHEN** the visibility filter evaluates a seed loop that has no explicit `audience`
- **THEN** `inferAudience` derives one from the loop's existing fields so the filter can classify it

### Requirement: Attribute-driven visibility filter

A pure function `isVisibleTo(loop, viewer)` SHALL decide whether a loop is visible to a viewer based on the loop's audience and the viewer's attributes (dorm/building, floor, major, courses). `visibleLoops(world, viewer)` SHALL return the world's loops filtered by `isVisibleTo`. The same audience logic SHALL apply to intents. The three students' attributes (Sarah & Maya on Donlon 2F / CS; Josh in Balch / CS) SHALL produce correct results: a floor-scoped Donlon-2F loop is visible to Sarah and Maya but not Josh; a CS-2110 class loop is visible to all three; a campus/north loop is visible to all three.

#### Scenario: Floor-scoped loop is hidden from off-floor viewer

- **WHEN** a loop's audience is floor `Donlon 2F` and the viewer lives in Balch
- **THEN** `isVisibleTo` returns false for that viewer

#### Scenario: Class-scoped loop is visible to matching students

- **WHEN** a loop's audience is class `CS 2110` and the viewer takes that course (or, as a demo fallback, shares the major)
- **THEN** `isVisibleTo` returns true

### Requirement: Membership overrides scope

A loop the viewer is a member of SHALL always be visible to that viewer, even when it is outside the viewer's audience scope.

#### Scenario: Joined out-of-scope loop stays visible

- **WHEN** a viewer is a member of a loop whose audience would otherwise exclude them
- **THEN** `isVisibleTo` returns true for that viewer

### Requirement: Viewer-relative feed scope

The feed's scope dial and any scope labels SHALL be derived from the current viewer's attributes rather than hardcoded to one dorm/floor. The feed's candidate pool SHALL be drawn from `visibleLoops(world, viewer)`.

#### Scenario: Scope labels match the viewer

- **WHEN** a persona in Balch views the feed's scope dial
- **THEN** the dial's labels reflect that viewer's dorm/building, not a hardcoded "Donlon"
