## ADDED Requirements

### Requirement: Team endpoint
The system SHALL serve the team toolset at its own authenticated MCP route, registering only `team_brief`, `team_state`, `file_output`, `log_decision`, `claim`, `whats_new`, `amend_record`, `resolve_tag`, `list_tags`, `search_knowledge` and `read_document`.

#### Scenario: Team route
- **WHEN** an assistant lists tools on the team route
- **THEN** personal-memory, planning, activity, commitment, disclosure and shared-note tools are not listed or callable there.

#### Scenario: Existing routes
- **WHEN** an assistant uses the existing MCP route or JSON endpoints
- **THEN** they behave as before this change.

### Requirement: State and brief
The system SHALL answer `team_state` and `team_brief` from current team records and curated content, within stated bounds.

#### Scenario: Where are we, for a team
- **WHEN** `team_state` is called for a team
- **THEN** the result contains the brief's deadline, open claims with owner and due date, current outputs, current decisions and conflict flags for the whole team, with each item's event noted and each list capped at 30 with a count of the rest.

#### Scenario: Where are we, for an event
- **WHEN** `team_state` is called for an event
- **THEN** the result contains that event's open claims and current outputs and the team-wide current decisions.

#### Scenario: Brief
- **WHEN** `team_brief` is called
- **THEN** the result contains the curated brief, up to 5 current announcements, titles of uploaded resources, and counts of open claims and current outputs.

#### Scenario: No statement about people
- **WHEN** any tool returns
- **THEN** the result contains no statement about a member's inactivity, effort, availability or sentiment.

### Requirement: What is new
The system SHALL return changes to a team's records in the order they were committed, using an opaque cursor.

#### Scenario: With a cursor
- **WHEN** `whats_new` is called with a cursor
- **THEN** it returns up to 30 changes after that cursor, oldest first, each marked if it mentions the caller, and the next cursor.

#### Scenario: Without a cursor
- **WHEN** `whats_new` is called with no cursor and no date
- **THEN** it returns changes from the last 7 days, says so, and returns the next cursor.

#### Scenario: No missed changes
- **WHEN** a write commits after a `whats_new` call returned
- **THEN** the next call with the returned cursor includes it.

### Requirement: Save on ask
The system SHALL save a team write in a single call without a separate approval step, SHALL describe each write tool as callable only when the user asked to share with the team, and SHALL annotate write tools as writes.

#### Scenario: Single-call write
- **WHEN** an assistant with write consent calls `claim` with valid input
- **THEN** the record is saved and returned in the same call.

#### Scenario: Site visibility of assistant writes
- **WHEN** a member opens the team page
- **THEN** they see their own recent records with the assistant that wrote each and a control to withdraw it.

### Requirement: Team named by handle
The system SHALL accept a team or event handle on every team tool and SHALL apply a default only where it cannot misdirect a write.

#### Scenario: Read with one consented team
- **WHEN** a read tool is called without a handle and the assistant has consent for exactly one team
- **THEN** that team is used.

#### Scenario: Write when the member has several teams
- **WHEN** a write tool is called without a handle and the member belongs to more than one team
- **THEN** nothing is saved and the available team handles are returned.

### Requirement: Human references
The system SHALL identify records to assistants and people by a short per-team number, and decisions also by topic key, and SHALL accept those references as input.

#### Scenario: Text-only client
- **WHEN** an assistant that received only the text form names a decision by topic key or a record by number in a later call
- **THEN** the call resolves it within the team.

#### Scenario: No internal identifiers
- **WHEN** any team tool returns
- **THEN** neither form contains a person ID.

### Requirement: Plain-text results
The system SHALL return, for every tool and every error on the team route, a text form that is sufficient without the structured form and obeys fixed format rules.

#### Scenario: Format rules
- **WHEN** any text form is produced
- **THEN** it contains no `{`, no UUID, no `|`, no line starting with `#`, no `**`; no line other than a link exceeds 200 characters; the whole does not exceed 3,500 characters and ends with a count of omitted items when cut; and every URL stands alone on its line with its host shown beside the title.

#### Scenario: Member text cannot forge output
- **WHEN** member-written text is rendered
- **THEN** it appears on one line after a fixed quote prefix with messenger formatting characters removed.

#### Scenario: Declined save
- **WHEN** a tool declines to save or fails
- **THEN** the text form states what happened and the next step.

### Requirement: Returned content is data
The system SHALL mark member-written and curated text as untrusted data in tool descriptions and structured results.

#### Scenario: Instruction-like record
- **WHEN** a record's text reads as an instruction to an assistant
- **THEN** it is returned only as quoted data, and write caps still apply to any call that follows.

### Requirement: Identity comes from the verified token
The system SHALL derive the caller's identity only from the verified bearer token or first-party session.

#### Scenario: Spoofed identity header
- **WHEN** a request to any MCP or JSON route includes an `X-Subject-Id` or similar header naming another person
- **THEN** the header is ignored.

### Requirement: Consent lifetime
The system SHALL let a member renew a read-and-write team grant, and SHALL warn through `team_brief` when the calling assistant's grant expires within 5 days.

#### Scenario: Renewal
- **WHEN** a member renews an active team grant on the site
- **THEN** the grant is extended with the same actions and no others.
