## MODIFIED Requirements

### Requirement: A title is enough to post
The post form SHALL use `freeform-intent-composer` to obtain the required activity title (at most 80 characters) and optional day, time, place, rhythm and preferences. Posting SHALL create an open proposal with `needs_day=false`, store the interpreted values, record the poster as in, and write one proposal_posted event. The minimum SHALL remain the existing default.

#### Scenario: Minimal post
- **WHEN** a signed-in person posts `Suits in Hoi An`
- **THEN** an open undated proposal exists with that title, no preferences, once rhythm and the poster in

### Requirement: Title, minimum and cost are fixed after posting
Title, minimum and legacy cost SHALL remain fixed. The poster SHALL be able to edit day, time, place, preferences and rhythm while the proposal is open and not idled. No edit SHALL send notifications or change existing answers.

#### Scenario: Preference edit
- **WHEN** the poster changes a preference on an open plan
- **THEN** the change persists, the activity title and responses stay unchanged, and no notification is sent

### Requirement: Post a version
A didn't-form plan SHALL offer Post it again, prefilled with title, still-valid day, time, place, rhythm and preferences. The new proposal SHALL record version_of and start a fresh count.

#### Scenario: Retry with pins
- **WHEN** a person reposts an idled weekly dinner with a ramen preference
- **THEN** the new draft retains weekly and ramen, clears an expired day, and posting creates a distinct proposal with only its poster initially in
