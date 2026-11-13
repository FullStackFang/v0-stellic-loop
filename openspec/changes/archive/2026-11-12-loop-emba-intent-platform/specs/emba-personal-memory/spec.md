## ADDED Requirements

### Requirement: Typed personal memory
The system SHALL distinguish person-owned persistent Wants from time-boxed Intents, shared Activities and explicit Commitments. Wants SHALL carry version, context, strength, extraction confidence, unique evidence count, confirmation time and lifecycle state. Publication and commitment SHALL require separate actions from compilation or saving a want.

#### Scenario: Casual interest
- **WHEN** a member compiles “a food tour sounds fun”
- **THEN** the system proposes structured fields without publishing an activity or creating a commitment

### Requirement: Transient compilation and sensitive exclusions
Raw conversation input SHALL remain transient and SHALL not enter storage, logs, traces, queues, vectors or audit content. Only member-accepted structured output SHALL become durable active preferences. Crisis input SHALL use only the individual support response and SHALL create no normal memory, group event or aggregate contribution. Sensitive attributes SHALL not create groups or tags.

#### Scenario: Crisis and failure canaries
- **WHEN** crisis input or a compiler failure includes a distinctive raw-text canary
- **THEN** normal persistence and telemetry contain neither the canary nor a crisis-derived intent

### Requirement: Correction and evidence lifecycle
Wants SHALL support proposed, active, needs_review, superseded and archived states. Explicit corrections SHALL supersede earlier versions; inferred contradictions SHALL require review. Context-specific preferences SHALL not replace global preferences. Version checks and operation IDs SHALL prevent lost updates and duplicate evidence. Retrieval frequency SHALL not increase strength.

#### Scenario: Concurrent inference and correction
- **WHEN** a compiler submits an older conflicting version after the member corrects a want
- **THEN** the correction remains current and the stale update cannot overwrite it

#### Scenario: Repeated feedback
- **WHEN** the same feedback operation is retried
- **THEN** evidence and preference strength change at most once

### Requirement: Contextual planning bundle
`plan_for_me(place, start, end)` SHALL return authorized active contextual wants, cited resource passages and published activities overlapping the place/time, within a response budget. It SHALL disclose truncation, source versions and incomplete/conflicting evidence. It SHALL NOT return conversation history, infer a booking or enroll the caller. Archived, superseded and review-needed wants SHALL be excluded from ordinary planning.

#### Scenario: Insufficient context
- **WHEN** no current authorized evidence supports the requested plan
- **THEN** the tool returns an explicit insufficient-evidence state rather than invented preferences or trip facts

### Requirement: Explicit feedback
Feedback SHALL distinguish attendance from preference assessment. Only explicit assessment SHALL adjust preference strength; nonattendance and nonresponse SHALL not imply dislike. The system SHALL enforce one current assessment per person and logical activity across operation IDs and activity revisions, contributing at most one evidence observation to each affected want. Correcting or deleting an assessment SHALL replace or remove its earlier contribution rather than incrementing evidence again. Members SHALL be able to inspect and correct the resulting want.

#### Scenario: Missed event
- **WHEN** a member says they did not attend and gives no assessment
- **THEN** the system records permitted attendance feedback without weakening their preference

#### Scenario: New operation ID for the same event
- **WHEN** a member submits a second assessment for the same logical activity using a new operation ID
- **THEN** it replaces the prior assessment contribution and does not increase the unique evidence count
