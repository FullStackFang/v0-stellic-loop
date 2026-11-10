# Spec Delta

## Purpose

Lets a crewed member say whether they are coming to a specific meeting without touching their standing intent, so crewmates know who to expect this week and the pilot can compare "said In" with "came".

## ADDED Requirements

### Requirement: RSVP is per crewed member per occurrence
The system SHALL keep one RSVP per (occurrence, membership) with status `in`, `out`, or `no_reply`, only for members who are in a crew of that loop and have not left. A member with no answer SHALL read as `no_reply`.

#### Scenario: Uncrewed member
- **WHEN** a member who is not in a crew tries to RSVP
- **THEN** the request is refused and nothing is stored

#### Scenario: Default
- **WHEN** a crewed member has not answered for the next occurrence
- **THEN** their status for that occurrence is `no_reply`

### Requirement: Member page RSVP controls
The member page SHALL offer "I'm in" and "Can't this week" for the loop's next occurrence and SHALL show the viewer's current answer. Changing the answer SHALL overwrite the previous one and record the response time.

#### Scenario: Answer In
- **WHEN** a crewed member taps "I'm in"
- **THEN** their RSVP for the next occurrence is `in` with a response time, and the page shows it

#### Scenario: Change answer
- **WHEN** the member later taps "Can't this week"
- **THEN** the RSVP is `out` and the earlier `in` is gone

### Requirement: Crewmates see this week's RSVP only
Crewmates SHALL see each member's RSVP status (In / Out / No reply) for the next occurrence by first name, and nothing for past or later occurrences.

#### Scenario: Crew list
- **WHEN** Sarah views her crew and Josh answered `out` for this Thursday
- **THEN** Josh shows as "Josh · Out" and no RSVP for any other week is shown

### Requirement: RSVP does not change intent
Answering an RSVP SHALL never change the member's standing intent or write an intent history row.

#### Scenario: Out this week, still conditional
- **WHEN** a `crew_conditional` member answers `out`
- **THEN** their intent is still `crew_conditional` and no history row is added

### Requirement: RSVP closes with the occurrence
RSVP answers SHALL be accepted only until the occurrence ends and SHALL be refused for cancelled occurrences.

#### Scenario: After the meeting
- **WHEN** a member tries to answer for an occurrence that has ended
- **THEN** the request is refused
