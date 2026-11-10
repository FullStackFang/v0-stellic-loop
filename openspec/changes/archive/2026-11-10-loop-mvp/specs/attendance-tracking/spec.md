# Spec Delta

## Purpose

Makes each weekly meeting a first-class occurrence with organizer-recorded attendance, so "went" and "kept coming" exist as facts the pilot can measure and can be compared with what members said beforehand.

## ADDED Requirements

### Requirement: Occurrences derive from the weekly slot
A weekly loop SHALL have a weekly slot (weekday, local start time, duration, campus time zone, place). The system SHALL keep at least the next 4 occurrences materialized, created on loop creation and topped up by a daily job, each at the slot's local wall time in the campus time zone.

#### Scenario: Loop created
- **WHEN** an organizer creates a loop meeting Thursdays at 7pm
- **THEN** occurrences exist for the next four Thursdays at 7:00 PM local time

#### Scenario: Daily top-up
- **WHEN** the daily job runs and only three future occurrences exist
- **THEN** a fourth is created and running the job again creates nothing

#### Scenario: Across the daylight-saving change
- **WHEN** occurrences span Sunday Nov 1 2026
- **THEN** the occurrence after the change is still at 7:00 PM local time

### Requirement: One-off loops have exactly one occurrence
A one-off loop SHALL have a single date-time instead of a weekly slot and exactly one occurrence, created at loop creation. The daily top-up SHALL skip one-off loops. Crews, RSVP, reminders, attendance, statistics, and the linked URL SHALL behave as for a weekly loop.

#### Scenario: Kickoff
- **WHEN** an organizer creates a one-off loop for Nov 3 2026 at 6pm
- **THEN** exactly one occurrence exists and the daily job never adds another

#### Scenario: After the one-off
- **WHEN** the single occurrence has ended
- **THEN** the loop has no next occurrence and the member page says so

### Requirement: The weekly slot is immutable
After creation, the loop's weekday and start time (or the one-off date-time) SHALL NOT be editable in this version. Place and linked URL remain editable.

#### Scenario: Edit attempt
- **WHEN** the organizer opens loop settings
- **THEN** weekday and time (or the one-off date-time) are shown read-only

### Requirement: Next occurrence
The next occurrence of a loop SHALL be the earliest occurrence that is not cancelled and whose start time plus duration is after now.

#### Scenario: During the meeting
- **WHEN** it is 7:30 PM on Thursday and the loop meets Thursdays 7:00–8:30 PM
- **THEN** the next occurrence is today's, not next week's

### Requirement: Organizer can cancel an occurrence
The organizer SHALL be able to cancel a future occurrence. A cancelled occurrence SHALL be excluded from the next occurrence, RSVP, reminders, attendance, statistics, the weekly digest, and calendar feeds.

#### Scenario: Thanksgiving week
- **WHEN** the organizer cancels the Nov 26 2026 occurrence
- **THEN** the member page skips to Dec 3 and no statistic counts Nov 26

### Requirement: Organizer marks attendance per occurrence
For any occurrence that has started and is not cancelled, the organizer SHALL be able to cycle the mark of each crew member whose crew window covers that occurrence (crewed at or before its start and, if they left, left after it): unmarked → present → absent → unmarked. A cell outside the member's window SHALL show the RSVP only and SHALL NOT be markable, so no mark can count an occurrence for a crew the member was not in.

#### Scenario: Latecomer's earlier week
- **WHEN** Josh joined his crew on Oct 5 and the organizer opens the Oct 1 column
- **THEN** Josh's Oct 1 cell shows his RSVP only and cannot be marked

#### Scenario: Mark present
- **WHEN** the organizer taps Sarah's cell for last Thursday once
- **THEN** Sarah is marked present for that occurrence

#### Scenario: Future occurrence
- **WHEN** the organizer opens attendance for an occurrence that has not started
- **THEN** marking is disabled

### Requirement: Counted occurrences
For a crew, an occurrence SHALL count only if it is not cancelled, has started, and has at least one attendance mark for any member of that crew.

#### Scenario: Unmarked week
- **WHEN** the organizer never marks a given Thursday for a crew
- **THEN** that Thursday is excluded from every statistic for that crew

### Requirement: A crew met when three or more were present
A crew SHALL have met at a counted occurrence when at least 3 of its members are marked present.

#### Scenario: Two present
- **WHEN** only two members of a crew are marked present
- **THEN** the crew did not meet at that occurrence

### Requirement: Reached third meeting
A crew SHALL have reached its third meeting when it has met at three distinct occurrences.

#### Scenario: Three meetings
- **WHEN** a crew has met on three Thursdays
- **THEN** the crew is flagged "reached third meeting"

### Requirement: Show-up rate
A crew's show-up rate SHALL be present marks divided by the number of (member, counted occurrence) pairs where the occurrence starts at or after the member's crewed time and before the member's leave time if any. Intent and RSVP SHALL NOT change the denominator.

#### Scenario: Rate calculation
- **WHEN** a crew of 4 has two counted occurrences with 3 and 4 present and nobody was late to the crew
- **THEN** its show-up rate is 7 of 8

#### Scenario: Latecomer
- **WHEN** a fifth member was crewed after the first counted occurrence
- **THEN** that member adds only the second occurrence to the denominator

#### Scenario: Out this week still counts
- **WHEN** a member answered Out and was marked absent
- **THEN** that pair is in the denominator and not in the numerator

### Requirement: Said In and came
For each crew the system SHALL also report, over counted occurrences, the number of (member, occurrence) pairs with RSVP `in` and the number of those marked present.

#### Scenario: Two said In
- **WHEN** at a counted occurrence two members answered In and one of them was marked present
- **THEN** that occurrence contributes 2 to "said In" and 1 to "said In and came"

### Requirement: Overall show-up rate
The loop's overall show-up rate SHALL be the pooled ratio: the sum of present marks over the sum of denominators across all crews.

#### Scenario: Two crews
- **WHEN** crew A is 7 of 8 and crew B is 3 of 8
- **THEN** the overall rate is 10 of 16
