# board-creation Specification

## Purpose
TBD - created by archiving change quorum-boards. Update Purpose after archive.
## Requirements
### Requirement: Start a board from the home page
The home page SHALL offer "Start a board" under its current line about the pinned link. The form SHALL ask only for a board name (required, up to 60 characters) and, for a visitor with no session, name and number following the `board-identity` rules. Every board started this way SHALL be rolling ("Next two weeks"); fixed-date boards SHALL be created only by the founder through SQL or the seed. The board's timezone SHALL be the visitor's browser timezone, sent with the form and validated against the IANA list on the server, falling back to America/New_York; the form SHALL show no timezone control.

#### Scenario: Team board in one step
- **WHEN** a visitor with no cookie enters "Strategy team", gives their name and a new number, and submits
- **THEN** a rolling board named "Strategy team" exists in the visitor's timezone, the visitor is signed in, and they land on its page

#### Scenario: Known number on a new device
- **WHEN** a visitor gives a number that already has a person
- **THEN** the form asks for the code as in `board-identity`, no board exists yet, and the board is created and the visitor lands on it once the code is accepted

#### Scenario: Bad timezone
- **WHEN** the form arrives with timezone "Mars/Olympus"
- **THEN** the board is created with America/New_York

### Requirement: Boards get a readable, unique slug
The slug SHALL be made from the name: accents removed, lowercase ASCII letters, digits and single hyphens, with the base cut to at most 28 characters so a suffix still fits in 32. If that slug is taken the system SHALL use "-2", "-3" and so on, where only a slug equal to the base or to the base plus "-<number>" counts as taken. A name with no usable characters SHALL get a random 6-character slug. Concurrent starts SHALL never fail on a slug clash. The slug SHALL NOT change after creation.

#### Scenario: Slug from name
- **WHEN** a board is named "Ski Club '26!"
- **THEN** its slug is `ski-club-26`

#### Scenario: Taken slug
- **WHEN** `strategy-team` and `strategy-team-building` exist and a new board is named "Strategy team"
- **THEN** its slug is `strategy-team-2`

#### Scenario: Emoji-only name
- **WHEN** a board is named only with symbols that have no letters or digits
- **THEN** it gets a random 6-character slug

### Requirement: The new board is empty and ready to share
After creation the starter SHALL land on `/b/<slug>`, which SHALL show the v5 hero (whose "Post an intent" action is the only post action on the page) and the existing `.empty` text "Nothing posted yet. Post the first thing you could do." followed by one ghost button "Copy the link" in an actions row. Copying SHALL put the board URL on the clipboard and show a toast. The starter SHALL be on the board's roster.

#### Scenario: First visit
- **WHEN** the starter lands on a new board
- **THEN** the hero shows "· 0 open · 0 on", the empty text and "Copy the link" are shown, there is no second "Post an intent" button, and the starter is on the roster

### Requirement: Boards are ownerless
The person who starts a board SHALL have no powers on it that others lack: no editing, closing, deleting or moderating the board. The board name and window SHALL be fixed after creation.

#### Scenario: Starter's view
- **WHEN** the starter opens their board
- **THEN** they see the same page and actions as any other person on it

### Requirement: Starting a board is recorded and rate-limited
Creating a board SHALL write one `board_created` event with the starter, source `direct` (never the entry attribution), and `{"window":"rolling"}` as data. A number SHALL start at most 3 boards per rolling hour, counted from `board_created` events in the database; beyond that the form SHALL say "Too many new boards. Try again in an hour." and create nothing. A per-IP limit of 5 per hour SHALL also apply on a best-effort basis per server instance.

#### Scenario: Event
- **WHEN** Priya starts "Strategy team"
- **THEN** exactly one `board_created` event exists for that board with Priya as person, source `direct`, and `{"window":"rolling"}` as data

#### Scenario: Limit
- **WHEN** the same number starts a fourth board within an hour, on any server instance
- **THEN** the form shows the limit message and no board is created

### Requirement: Boards are unlisted
Board and proposal pages SHALL tell search engines not to index or follow them, and the site SHALL serve a robots file that disallows `/b/` and `/p/`. There SHALL be no directory of boards.

#### Scenario: Robots
- **WHEN** a crawler fetches `/robots.txt` and `/b/strategy-team`
- **THEN** `/b/` and `/p/` are disallowed and the page carries `noindex, nofollow`

### Requirement: New screens use only the v5 system
The start-a-board form, the empty board state and every other screen or state in this change SHALL be built only from classes that exist in `public/demo/quorum.html` v5, and SHALL add no rule, colour, font, radius or shadow to `app/globals.css`. No emoji. Native date pickers SHALL NOT appear.

#### Scenario: No CSS change
- **WHEN** the change is complete
- **THEN** `git diff --quiet <base> -- app/globals.css` succeeds, where `<base>` is the commit before this change

#### Scenario: Only mock classes
- **WHEN** the rendering tests render the start-a-board form, the empty board, the copy-names action and a 14-day strip
- **THEN** every class name they emit appears as a selector in `public/demo/quorum.html`

