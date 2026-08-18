# shared-world-state Specification

## Purpose
TBD - created by archiving change shared-world-persistence. Update Purpose after archive.
## Requirements
### Requirement: Single shared world object

The demo SHALL hold all campus-truth state in one serializable `world` object that is the single source of truth for every student persona. The world SHALL contain: `version` (integer), `loops` (array), `intents` (array, each authored with a `userId`), `wrapped` (array), `notifs` (object keyed by recipient `userId`), and `feedback` (object keyed by `userId`). Reads that are viewer-relative (e.g. "my loops", "am I a member") SHALL be derived from the world plus the current `viewerId`, never stored as separate per-persona copies.

#### Scenario: World is the sole source of truth

- **WHEN** any student persona reads loops, intents, wrapped loops, notifications, or feedback
- **THEN** the value is derived from the one shared `world` object (filtered by `viewerId` where the read is viewer-relative), and no per-persona duplicate of that state exists

#### Scenario: Intents are authored

- **WHEN** a persona saves an intent
- **THEN** the intent is stored in `world.intents` with a `userId` equal to the current `viewerId`

### Requirement: Ephemeral state is separated from the world

Session and view state SHALL NOT be part of the persisted world. The following SHALL remain ephemeral React state and SHALL NOT be serialized: current `screen`, open `sheet`, `suggestions`, `activeLoopId`, `highlightId`, `detailBanner`, `draft`, `nudge`, `toast`, `rateId`, `safetySubject`, `shareLoopId`, and `intentSeed`. The `foldedIn` flag SHALL be removed entirely.

#### Scenario: UI state never persists

- **WHEN** the world is serialized
- **THEN** no open sheet, toast, active screen, draft, or other view/session state is included in the serialized blob

### Requirement: Per-recipient notifications

Notifications SHALL be stored per recipient as `world.notifs[userId]`. A notification event (fold-in, wrap) SHALL be addressed to a specific recipient rather than to "the current viewer". A persona SHALL see only the notifications addressed to its own `userId`.

#### Scenario: Persona sees only its own notifications

- **WHEN** the viewer toggles to a persona
- **THEN** the notifications shown are exactly `world.notifs[viewerId]` (an empty list if none)

### Requirement: Per-user private feedback

Like/neutral/dislike feedback on people and loops SHALL be stored per user as `world.feedback[userId]` and SHALL never be visible to any other user. The "to rate" count and rated/unrated status SHALL be derived from the current viewer's feedback map.

#### Scenario: Ratings are independent per persona

- **WHEN** one persona rates a wrapped loop and the viewer toggles to a different persona
- **THEN** the second persona's rated/unrated status and "to rate" count are unaffected by the first persona's ratings

### Requirement: Authorship without ownership

Loop authorship SHALL be recorded as provenance metadata only (`createdBy`, `seededBy`) and SHALL confer no special capability. The set of available actions SHALL be identical for every student persona. Governance of a loop's live session (moving location, holding the pin) SHALL be gated on presence (`hereIds` via `checkIn`/`moveTonight`), never on authorship.

#### Scenario: Author has no extra powers

- **WHEN** any persona views a loop they created versus one they did not
- **THEN** the available actions are the same set available to any other member, with authorship surfaced only as recognition (e.g. a "seeded it" label), and any move/pin action remains gated on presence

