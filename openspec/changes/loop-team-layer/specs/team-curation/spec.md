## ADDED Requirements

### Requirement: Curated brief
The system SHALL let an owner or organizer write and edit a team's brief on the site, including an optional deadline and the team's timezone, and SHALL return it through `team_brief`.

#### Scenario: Editing the brief
- **WHEN** an owner or organizer saves a brief of at most 4,000 characters
- **THEN** it becomes current, the prior version is kept as history, and members' assistants receive the new version.

#### Scenario: Member or assistant attempt
- **WHEN** a member without the owner or organizer role, or any assistant, tries to edit the brief
- **THEN** it is denied.

### Requirement: Events under a team
The system SHALL let an owner or organizer create, rename and archive named events under a team on the site, addressable as `@team/slug`, with access decided at the team.

#### Scenario: Creating an event
- **WHEN** an owner or organizer creates an event with a slug unused in the team's namespace
- **THEN** team members can resolve it and file outputs and claims to it.

#### Scenario: Consent covers events
- **WHEN** a member has granted an assistant access to a team
- **THEN** that assistant can use the team's events with no separate grant.

#### Scenario: Archiving
- **WHEN** an event is archived
- **THEN** it no longer resolves or accepts new records, and its existing records remain in the team's history.

### Requirement: Announcements
The system SHALL let an owner or organizer post and withdraw announcements of at most 600 characters on the site.

#### Scenario: Posting
- **WHEN** an owner or organizer posts an announcement
- **THEN** it appears in `whats_new` and, while among the 5 most recent not withdrawn, in `team_brief`, as quoted data with its author; no message is sent.

### Requirement: Site view and control of the team's records
The system SHALL show current members the team's current decisions, outputs, claims and conflict flags on the site, and SHALL provide the controls that tools provide.

#### Scenario: Member view
- **WHEN** a member opens the team page
- **THEN** they see the same current records their assistant would receive from `team_state`.

#### Scenario: Controls
- **WHEN** an authorized person uses the team page
- **THEN** they can withdraw a record they may withdraw, confirm or decline a claim proposed for them, mark a claim done or released, and remove a tag on themselves.

#### Scenario: Non-member
- **WHEN** a signed-in person who is not a member opens the team page
- **THEN** they see that the group is unavailable and nothing about its contents.

### Requirement: Consent choice per assistant
The system SHALL let a member grant each assistant read, or read and write, per team, and SHALL describe write as allowing the assistant to save to the team without a further approval step.

#### Scenario: Granting write
- **WHEN** a member grants read and write to an assistant for a team
- **THEN** the page states that the assistant can save decisions, outputs and claims under the member's name when asked.
