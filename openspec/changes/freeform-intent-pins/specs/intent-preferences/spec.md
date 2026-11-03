## ADDED Requirements

### Requirement: Durable validated metadata
The system SHALL persist rhythm and up to 12 custom preferences of at most 60 characters with each proposal. The server SHALL reject invalid metadata before requesting identity. Legacy proposals SHALL behave as one-off plans without preferences.

#### Scenario: Verification replay
- **WHEN** a stranger posts with weekly rhythm and two preferences and verifies their phone
- **THEN** exactly one proposal stores the same rhythm and preferences, with that person counted in

#### Scenario: Malformed request
- **WHEN** a request contains a non-array preferences value, unsupported rhythm or overlong preference
- **THEN** the server returns a validation error and sends no verification code

### Requirement: Public preferences and honest rhythm
Plan details SHALL display stored preferences and any repeating rhythm. Composer copy SHALL identify preferences as visible to the space. Rhythm SHALL be labeled as a preference; future plans SHALL require fresh counts. The UI SHALL NOT claim automatic matching, future RSVPs or calendar synchronization.

#### Scenario: Weekly preference
- **WHEN** a weekly proposal reaches four yeses
- **THEN** only that proposal forms and no future proposal or RSVP is created

### Requirement: Authorized updates
Only the poster SHALL be allowed to update preferences and rhythm while a plan is open and not idled. Updates SHALL use the existing row lock and write an event. Partial slot edits SHALL preserve metadata. Formed and closed plans SHALL reject these edits.

#### Scenario: Another person edits
- **WHEN** a non-poster submits changed preferences
- **THEN** the update is rejected and the stored preferences remain unchanged

#### Scenario: Round trip
- **WHEN** the poster removes a preference and reloads the plan
- **THEN** the removed pin stays removed and all other values persist
