# intent-posting Specification

## Purpose
TBD - created by archiving change quorum-board. Update Purpose after archive.
## Requirements
### Requirement: A title is enough to post
The post form SHALL use `freeform-intent-composer` to obtain the required activity title (at most 80 characters) and optional day, time, place, rhythm and preferences. Posting SHALL create an open proposal with `needs_day=false`, store the interpreted values, record the poster as in, and write one proposal_posted event. The minimum SHALL remain the existing default.

#### Scenario: Minimal post
- **WHEN** a signed-in person posts `Suits in Hoi An`
- **THEN** an open undated proposal exists with that title, no preferences, once rhythm and the poster in

### Requirement: Posting requires identity
A visitor with no session SHALL be asked for name and number as part of posting, following the `board-identity` rules; the proposal SHALL NOT exist until identity is established.

#### Scenario: Stranger posts
- **WHEN** a visitor with no cookie submits the post form
- **THEN** they are asked for name and number, and on success the proposal is created with them as poster

### Requirement: Title, minimum and cost are fixed after posting
Title, minimum and legacy cost SHALL remain fixed. The poster SHALL be able to edit day, time, place, preferences and rhythm while the proposal is open and not idled. No edit SHALL send notifications or change existing answers.

#### Scenario: Preference edit
- **WHEN** the poster changes a preference on an open plan
- **THEN** the change persists, the activity title and responses stay unchanged, and no notification is sent

### Requirement: Anyone in can add shared details
A person who is `in` on a proposal SHALL be able to add a link, a place or a note. Each addition SHALL show who added it. Nobody SHALL be notified about details. A person not `in` SHALL see the details and a prompt to tap in to add.

#### Scenario: Add a link
- **WHEN** Marcus, who is in, submits "reddit.com/r/hoian" in the add row
- **THEN** a `link` detail appears attributed to Marcus and a `detail_added` event exists

#### Scenario: Not in
- **WHEN** a person who is `maybe` views the details
- **THEN** no add row is shown and the page says "Tap in to add details"

### Requirement: Post a version
A didn't-form plan SHALL offer Post it again, prefilled with title, still-valid day, time, place, rhythm and preferences. The new proposal SHALL record version_of and start a fresh count.

#### Scenario: Retry with pins
- **WHEN** a person reposts an idled weekly dinner with a ramen preference
- **THEN** the new draft retains weekly and ramen, clears an expired day, and posting creates a distinct proposal with only its poster initially in
