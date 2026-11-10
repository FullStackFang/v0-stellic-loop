# Spec Delta

## Purpose

Reminds every crewed member the day before a meeting and lets them answer In or Out from the email in one tap, so the crew knows who is coming before it happens.

## ADDED Requirements

### Requirement: Day-before reminder
A daily job, run at 14:00 UTC with its clock floored to the start of the hour, SHALL email every crewed, active member of a loop for every non-cancelled occurrence starting at least 12 and less than 36 hours after that hour. The window is 24 hours wide so a once-daily run reaches every occurrence exactly once. The email SHALL name the crew's first names, the time and place, the linked event, the current count of crew members who answered In, and one-tap In and Out links.

#### Scenario: Thursday loop
- **WHEN** the job runs Wednesday at 14:00 UTC and the loop meets Thursday 7pm ET (23:00 UTC, 33 hours later)
- **THEN** each crewed member receives one reminder for that occurrence, headed "Tomorrow"

#### Scenario: Same-day late meeting
- **WHEN** a meeting starts late enough in the evening that the run reaching it falls on the same local day
- **THEN** the reminder says "Tonight" instead of "Tomorrow"

#### Scenario: Outside the window
- **WHEN** the job runs and an occurrence starts 10 hours or 36 hours later
- **THEN** no reminder is sent by that run

#### Scenario: Cancelled occurrence
- **WHEN** the next occurrence is cancelled
- **THEN** no reminder is sent for it

### Requirement: Reminders are recorded and idempotent
The system SHALL record every reminder per (membership, occurrence) and SHALL never send a second reminder for the same pair.

#### Scenario: Job re-run
- **WHEN** the job runs twice in the window
- **THEN** the second run sends zero reminders

### Requirement: One-tap links are signed, single-purpose, and expire
The In and Out links SHALL carry a signed token bound to one membership, one occurrence, and one status, valid for 48 hours. Opening a valid link in a browser SHALL record that RSVP, through a form the link page submits on load (fetching the link without running the page SHALL write nothing), and then land on the member page, which requires sign-in and SHALL show "Marked you as In for Thursday" (or Out) with an undo that flips the same RSVP, so an accidental or forwarded tap is visible and reversible. The link SHALL NOT sign the person in or reveal any member data.

#### Scenario: Tap In from the email
- **WHEN** a member opens the In link within 48 hours
- **THEN** their RSVP for that occurrence is `in` and they are taken to the member page (or the sign-in page if signed out), which shows "Marked you as In for Thursday" with an undo

#### Scenario: Undo
- **WHEN** the member taps undo on that banner
- **THEN** their RSVP for that occurrence is `out` and the banner is gone

#### Scenario: Scanner prefetch
- **WHEN** a mail security scanner fetches both the In and Out links without running the page
- **THEN** no RSVP is written; opening a link shows a page that records the answer only when it submits its form, which it does on load in a browser, with a visible "Mark me In" or "Mark me Out" button as the fallback

#### Scenario: Expired link
- **WHEN** a link is opened after 48 hours
- **THEN** no RSVP is written and the page says the link expired, with a link to sign in

#### Scenario: Tampered link
- **WHEN** the token's signature does not verify
- **THEN** no RSVP is written and the page shows the same expired message

### Requirement: Reminder carries the loop footer
The reminder SHALL name the loop and organizer, include the loop's public URL, and include a leave link.

#### Scenario: Footer present
- **WHEN** a reminder is sent
- **THEN** its body contains the loop name, the organizer's first name, the loop URL, and the leave link
