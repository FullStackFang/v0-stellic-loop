## ADDED Requirements

### Requirement: One resolver for teams, events and people
The system SHALL resolve an `@` handle to the teams, events and people the caller can reach, and SHALL report every match when more than one exists.

#### Scenario: Team
- **WHEN** a member resolves `@acme` and belongs to the team with that namespace
- **THEN** the result is that team.

#### Scenario: Event
- **WHEN** a member resolves `@acme/final-deck` or the short form `@final-deck`
- **THEN** the result is the event with that slug under the team.

#### Scenario: Ambiguous short form
- **WHEN** a short handle matches entries in more than one team
- **THEN** the result is marked ambiguous and lists each match with its kind.

#### Scenario: Unknown or unauthorized
- **WHEN** a handle matches nothing the caller can reach
- **THEN** the result is the same whether the handle does not exist or the caller lacks access.

### Requirement: One namespace per team
The system SHALL reject a person handle, event slug or group slug that is already used by any of the three within the same team, so a full handle never resolves to two kinds.

#### Scenario: Handle equal to an event slug
- **WHEN** a member tries to save a handle equal to an existing event or group slug in the team
- **THEN** it is rejected.

#### Scenario: Event equal to a handle
- **WHEN** an organizer tries to create an event whose slug is a teammate's handle
- **THEN** it is rejected.

### Requirement: People opt in to being tagged
The system SHALL let a member choose one handle per team on the site and SHALL NOT make a person taggable until they choose one.

#### Scenario: Choosing a handle
- **WHEN** a signed-in member saves a valid unused handle on the site
- **THEN** teammates can resolve them as `@team/handle`.

#### Scenario: No handle
- **WHEN** a member has not chosen a handle
- **THEN** they appear in no tag listing or resolution.

#### Scenario: Assistant attempt
- **WHEN** an assistant tries to set or change a handle
- **THEN** it is denied.

#### Scenario: Member leaves
- **WHEN** a member's membership is revoked or their account is deleted
- **THEN** their handle is deleted and the name becomes available.

### Requirement: Listing what can be tagged
The system SHALL list the teams, events and opted-in people the caller can tag, without returning person IDs to assistants.

#### Scenario: Consent for a nested group only
- **WHEN** an assistant has consent for a nested group but not its parent team
- **THEN** the listing includes that group and none of the parent team's people or events.

#### Scenario: Consent revoked
- **WHEN** the member revokes the assistant's consent
- **THEN** listing and resolution return nothing for that team.

#### Scenario: Large teams
- **WHEN** a team has more taggable entries than one result holds
- **THEN** the result says it is partial, and resolution of a specific handle still succeeds.

### Requirement: A tag confers nothing
The system SHALL treat a tag as a reference only: it grants no access, proves no affiliation and sends no message.

#### Scenario: Tag as input
- **WHEN** a handle is supplied to any tool
- **THEN** access is decided by the caller's membership and consent, never by the handle.
