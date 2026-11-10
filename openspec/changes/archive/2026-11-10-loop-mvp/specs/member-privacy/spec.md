# Spec Delta

## Purpose

States the data boundaries every other capability must respect: a member sees only their own crew, intent is private, RSVP is visible only inside the crew for the current week, organizers see only their own loops, and anything campus-wide is a count.

## ADDED Requirements

### Requirement: No cross-loop visibility for members
A member of loop A SHALL have no way to learn that any person is a member of loop B, including by first name, count, crew composition, or RSVP.

#### Scenario: Shared member across loops
- **WHEN** Sarah is in loop A and loop B and Josh is only in loop A
- **THEN** nothing Josh can see mentions loop B or Sarah's membership in it

### Requirement: Intent is private to the member and organizer
A member's intent SHALL be readable only by that member and the loop's organizer. No other member SHALL be able to read or infer it.

#### Scenario: Member page
- **WHEN** a member page is rendered
- **THEN** the response contains no other member's intent value

### Requirement: RSVP visibility is bounded to the crew and the current week
A member's RSVP SHALL be readable by their crewmates only for the loop's next occurrence, and by the organizer for all occurrences. Past and future answers SHALL never be shown to crewmates.

#### Scenario: Past week
- **WHEN** a crewmate views the crew after Thursday's meeting has ended
- **THEN** the RSVPs shown are for the following occurrence, and last week's answers are not in the response

### Requirement: Drop attribution and RSVP source are organizer-only
Which drop a member arrived through, and which event tool they said they RSVPed on, SHALL be readable only by the organizer.

#### Scenario: Crewmate
- **WHEN** a member reads their crew through the data API
- **THEN** no drop id, label, token, or RSVP source is returned

### Requirement: Organizer scope
An organizer SHALL see members, intents, emails, RSVPs, RSVP sources, drops, crews, attendance, and metrics only for loops they organize.

#### Scenario: Two organizers
- **WHEN** organizer X opens any dashboard, export, or data query for a loop organized by Y
- **THEN** the request is refused as not found or returns zero rows

### Requirement: Campus-level data is counts only
Any view or export spanning more than one loop SHALL expose only counts. No such view exists in this version; the rule binds future work.

#### Scenario: Future campus summary
- **WHEN** a campus summary is ever produced
- **THEN** it contains totals only and no person-level data

### Requirement: Reads are enforced in the database
Every rule above SHALL be enforced by database policies, not only by the user interface. Members SHALL be able to read only their own membership row; crewmates SHALL be exposed only through a crew-members view that yields first name, you-flag, and this week's RSVP. Anonymous clients SHALL have no table access.

#### Scenario: Member queries own loop
- **WHEN** a member queries memberships of a loop they belong to through the data API
- **THEN** only their own row is returned

#### Scenario: Member queries another loop
- **WHEN** a member queries memberships of a loop they do not belong to
- **THEN** zero rows are returned

#### Scenario: Anonymous query
- **WHEN** an unauthenticated client queries any table
- **THEN** zero rows are returned

### Requirement: Writes are never direct
No signed-in client SHALL be able to insert, update, or delete any row directly. Every write SHALL go through a server action that checks the session and, where relevant, organizer ownership.

#### Scenario: Member tries to change crew
- **WHEN** a member issues an update of their own `crew_id` through the data API
- **THEN** zero rows are affected

#### Scenario: Member tries to create a loop
- **WHEN** a member issues an insert into loops through the data API
- **THEN** zero rows are affected
