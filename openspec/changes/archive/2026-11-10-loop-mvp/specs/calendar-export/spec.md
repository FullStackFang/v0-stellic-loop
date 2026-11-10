# Spec Delta

## Purpose

Puts the loop in whatever calendar the member already uses, which is the one integration that works with every event tool.

## ADDED Requirements

### Requirement: Recurring feed per loop
The system SHALL serve an iCalendar file per weekly loop with one weekly recurring event for the slot, expressed in the campus time zone with an embedded VTIMEZONE, an EXDATE for every cancelled occurrence, the place as location, and the loop's public URL in the description.

#### Scenario: Subscribe to loop
- **WHEN** a member opens the loop's feed URL
- **THEN** a valid iCalendar document is returned with a weekly RRULE, a VTIMEZONE for the campus zone, and an EXDATE per cancelled occurrence

#### Scenario: One-off loop
- **WHEN** the feed URL of a one-off loop is opened
- **THEN** the response is not found; the single-occurrence file is the export for that loop

### Requirement: Single file per occurrence
The system SHALL serve an iCalendar file per non-cancelled occurrence with one event in UTC, the place as location, and the occurrence's effective linked URL in the description.

#### Scenario: Download one week
- **WHEN** a member opens an occurrence's calendar URL
- **THEN** a valid iCalendar document with a single event at the correct instant is returned

#### Scenario: Cancelled occurrence
- **WHEN** the occurrence is cancelled
- **THEN** the URL returns not found

### Requirement: Calendar files are public but unguessable
Calendar URLs SHALL be reachable without sign-in, SHALL be keyed by a random token that is never exposed to clients except inside these URLs, and SHALL contain no member names or emails.

#### Scenario: Unauthenticated fetch
- **WHEN** a calendar app fetches the feed URL with no cookies
- **THEN** the feed is returned and contains no personal data
