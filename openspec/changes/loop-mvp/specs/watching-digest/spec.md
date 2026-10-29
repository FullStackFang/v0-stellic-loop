# Spec Delta

## Purpose

Keeps the "not this week" people warm with one weekly message and one tap to upgrade, so watching can convert into a conditional yes. Deferred until after the Oct 27 deploy.

## ADDED Requirements

### Requirement: Weekly email to watching members
A weekly job SHALL email each member whose intent is `watching` and who has not left the loop one message per loop containing the next occurrence's facts, the linked event, and a link to their member page.

#### Scenario: Weekly send
- **WHEN** the weekly job runs for a loop with three `watching` members
- **THEN** each receives exactly one email for that loop

#### Scenario: No watching members
- **WHEN** a loop has no `watching` members
- **THEN** no email is sent for that loop

#### Scenario: No upcoming occurrence
- **WHEN** a loop has no non-cancelled future occurrence
- **THEN** no digest is sent for that loop

### Requirement: Sends are recorded and idempotent
The system SHALL record every digest send per membership and week (the Monday of the ISO week in UTC at run time), and SHALL skip any membership that already has a record for the current week.

#### Scenario: Job re-run
- **WHEN** the weekly job runs twice in the same week
- **THEN** the second run sends zero emails

### Requirement: Digest link is a plain page link
The digest link SHALL be the member's ordinary page URL with a flag to focus the intent control. It SHALL NOT be a single-use or expiring token. If the member is signed out, the normal sign-in flow returns them to that page.

#### Scenario: Opened days later
- **WHEN** a member opens the digest link four days after it was sent
- **THEN** the page opens normally

#### Scenario: Upgrade
- **WHEN** a `watching` member opens the link and selects "In if there's a crew"
- **THEN** their intent becomes `crew_conditional`, a history row is written, and they appear in the organizer's eligible pool

### Requirement: Job reports uncrewed demand
The weekly job SHALL log, per loop, the count of eligible members not yet in a crew so the organizer can be nudged to form crews.

#### Scenario: Pending pool
- **WHEN** a loop has five eligible members and no crews
- **THEN** the job output names that loop with count 5

### Requirement: Only Loop-originated transactional email
The system SHALL send only these emails: sign-in link, placement notice, day-before reminder, weekly watching digest. Every app-sent email (placement, reminder, digest) SHALL name the loop and the organizer's first name, include the loop's public URL, and include a link to leave the loop. The sign-in link is exempt.

#### Scenario: Email footer
- **WHEN** a placement, reminder, or digest email is sent
- **THEN** it names the loop and organizer, includes the loop URL, and includes a leave link
