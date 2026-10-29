# Spec Delta

## Purpose

The organizer's single screen for one loop: who tapped in and with what intent, through which drop, the crews, attendance, the pilot metrics, and a CSV of all of it.

## ADDED Requirements

### Requirement: Only allowlisted organizers create loops
Loop creation SHALL be available only to persons whose email is on the organizer allowlist. Anyone else SHALL see "not found" at the create page.

#### Scenario: Student opens create page
- **WHEN** a signed-in person not on the allowlist opens `/org/new`
- **THEN** the system shows "not found"

### Requirement: Organizer creates and owns loops
An allowlisted person SHALL be able to create a loop (title, either a weekly slot of weekday and start time or a one-off date-time, duration, place, slug, optional default linked URL) and SHALL be its organizer. A taken slug SHALL be rejected with a message.

#### Scenario: Create loop
- **WHEN** the organizer submits the form with a free slug
- **THEN** the loop exists with them as organizer and its public URL is shown

#### Scenario: Slug taken
- **WHEN** the organizer submits a slug that exists
- **THEN** the form shows "that link is taken" and nothing is created

#### Scenario: One-off loop
- **WHEN** the organizer picks "one date" and enters Nov 3 2026 6:00 PM
- **THEN** the loop exists with exactly one occurrence and no weekly slot

### Requirement: Dashboard is organizer-only
Only the loop's organizer SHALL see its dashboard, exports, and crews. Others SHALL see "not found".

#### Scenario: Other person opens dashboard
- **WHEN** a signed-in person who is not the organizer opens the dashboard URL
- **THEN** the system shows "not found"

### Requirement: Loop settings editable after creation
The organizer SHALL be able to edit place and default linked URL after creation, manage drops (add, see URL, copy), and, when preview fetching exists, press "Refresh preview".

#### Scenario: Change default URL
- **WHEN** the organizer saves a new default URL
- **THEN** the member page links the new URL

#### Scenario: Add a drop
- **WHEN** the organizer adds a drop
- **THEN** its URL appears with a copy control

### Requirement: Members by intent
The dashboard SHALL list active members grouped by current intent, with first name, email, tap-in time, drop label if any, RSVP source if any, and crew if any, and SHALL show a count of eligible members not yet in a crew.

#### Scenario: Grouped list
- **WHEN** the organizer opens the dashboard
- **THEN** members appear under "In if there's a crew", "Going anyway", and "Watching" with counts, and a "waiting for a crew" count

### Requirement: Taps-in by drop and by RSVP source
The dashboard SHALL show the number of memberships attributed to each drop and the number with no drop, and the number of memberships per RSVP source (Luma, Partiful, CampusGroups, other, none, unanswered).

#### Scenario: Drop counts
- **WHEN** five members arrived via "Donlon 2F GroupMe" and two with no drop
- **THEN** the panel shows 5 beside that drop and 2 beside "no drop"

#### Scenario: Source counts
- **WHEN** three members said Luma and four left it blank
- **THEN** the panel shows 3 beside Luma and 4 beside "unanswered"

### Requirement: Organizer can remove a member
The organizer SHALL be able to remove a member, which has the same effect as the member leaving.

#### Scenario: Remove
- **WHEN** the organizer removes a member
- **THEN** that member is out of their crew, ineligible, and receives no further email

### Requirement: Form crews with preview and confirm
The dashboard SHALL offer "Form crews", show the proposed placements as first names grouped per existing or new crew, and save and email only after "Confirm". If the pool changed between preview and confirm, the dashboard SHALL show a fresh preview instead of saving; if nothing remains to place because the preview was already applied, it SHALL say so.

#### Scenario: Confirm twice
- **WHEN** the organizer confirms the same preview a second time (double submit or a second tab)
- **THEN** nothing is saved or emailed again and the dashboard says crews are already formed

#### Scenario: Preview then confirm
- **WHEN** the organizer presses "Form crews" then "Confirm"
- **THEN** crews are saved, newly placed members are emailed, and the dashboard shows each crew with its flags

### Requirement: Crew list with flags
The dashboard SHALL show each crew with its members, this week's RSVP per member, anchored flag, single-drop or mixed flag, reached-third-meeting flag, show-up rate, and "said In and came".

#### Scenario: Crew row
- **WHEN** an anchored single-drop crew has met three times at 85% show-up
- **THEN** its row shows "anchored", "single drop", "3rd meeting ✓", and "85%"

### Requirement: Occurrence controls
The dashboard SHALL list occurrences with a per-occurrence linked URL field, this week's In count, and a cancel action for future occurrences.

#### Scenario: Cancel
- **WHEN** the organizer cancels a future occurrence
- **THEN** it is marked cancelled and shown struck through

### Requirement: Attendance grid
The dashboard SHALL show a grid of crew members × started, non-cancelled occurrences, cycling unmarked → present → absent → unmarked on tap, persisting without reload, with each cell also showing the member's RSVP for that occurrence. Cells outside a member's crew window (before they were crewed, or after they left) SHALL show the RSVP only. Members who left but have marks SHALL stay as rows, labelled as left. The next not-started occurrence SHALL appear as a trailing RSVP-only column.

#### Scenario: Toggle attendance
- **WHEN** the organizer taps a cell twice
- **THEN** the mark is absent and persists on reload

### Requirement: Metrics panel
The dashboard SHALL show intent transition counts by from→to pair; anchored vs unanchored and single-drop vs mixed crew counts; crews reached third meeting; overall pooled show-up rate; "said In and came" overall; taps-in by drop; and watching conversion. (Deferred until after the Oct 27 deploy; the same numbers are available as SQL views.)

#### Scenario: Panel renders
- **WHEN** the organizer opens the dashboard of a seeded loop after the panel ships
- **THEN** every metric shows a number

### Requirement: Watching conversion definition
Conversion SHALL count entries into `watching` at least 14 days old whose first later transition went to `crew_conditional` or `going_want_crew` within 14 days, over all entries into `watching` at least 14 days old. Entries younger than 14 days SHALL be shown separately as pending.

#### Scenario: Conversion metric
- **WHEN** three members entered watching 20 days ago, one upgraded after 10 days, and one more entered watching 3 days ago
- **THEN** the panel shows conversion 1 of 3 and 1 pending

### Requirement: CSV export
The dashboard SHALL offer two CSV downloads: memberships (person id, first name, email, intent, tap-in time, drop, crewed time, crew id, anchored, left time) and events (one row per intent transition, one per RSVP, one per attendance mark). (Deferred until after the Oct 27 deploy; SQL export meanwhile.)

#### Scenario: Download
- **WHEN** the organizer presses "Export CSV" after the routes ship
- **THEN** the memberships file has a header row and one row per membership

### Requirement: Partiful note
When a loop or occurrence URL is on `partiful.com`, the dashboard SHALL show "Partiful: link and preview only, guest sync not available" next to that field.

#### Scenario: Partiful link set
- **WHEN** the organizer saves a `partiful.com` URL on an occurrence
- **THEN** the note appears next to that occurrence's field
