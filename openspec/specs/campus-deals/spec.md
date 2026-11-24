# campus-deals Specification

## Purpose
TBD - created by archiving change campus-deals. Update Purpose after archive.
## Requirements
### Requirement: The admin enters a deal once
The campus admin SHALL be able to save a deal with these fields:
- a known place on the campus;
- an activity name;
- the one line students see;
- a group size of 2, 3 or 4;
- one or more weekdays;
- a from time and an until time on the same day;
- a private note.

A deal SHALL be refused when any of these is missing, when the until time is not after the from time, or when the place is not on the campus. The admin SHALL be able to edit and hide a deal.

#### Scenario: A deal is saved
- **WHEN** the admin saves "Drinks at Nisi Bistro", "$2 off every drink", 2+, every day, 5:00pm–7:00pm, at Nisi Bistro
- **THEN** the deal is listed in the admin's Deals tab with its place, line, size, days and hours

#### Scenario: A deal with no days is refused
- **WHEN** the admin saves a deal with no weekday picked
- **THEN** it is not saved and the form says to pick at least one day

#### Scenario: Until before from is refused
- **WHEN** the admin saves a deal from 7:00pm until 5:00pm
- **THEN** it is not saved and the form says the until time must be after the from time

### Requirement: The private note is never shown to students
The deal's note SHALL be readable only on the admin page. No student-facing page, ticket, map or API response SHALL carry it.

#### Scenario: The note stays on the admin page
- **WHEN** a deal's note says "their daily happy hour, Roosevelt Islander Aug 2026" and a student opens the campus page during the deal
- **THEN** the student's page and its data contain neither the note nor the words "happy hour"

### Requirement: Each running day becomes one activity with a group reward
On a weekday the deal runs, in the campus's time zone, Loopd SHALL have exactly one activity for that deal and day. The activity SHALL be:
- at the deal's place, named with the activity name;
- starting and ending at the deal's hours;
- carrying a group reward with the deal's line and group size.

Making the day more than once SHALL NOT create a second activity or reward. No activity SHALL be made on a weekday the deal does not run, nor for a hidden deal.

#### Scenario: Today's activity is made once
- **WHEN** the campus page is read twice on a Monday for a deal that runs every day
- **THEN** there is one activity for that deal on that Monday, with one group reward of size 2 and text "$2 off every drink"

#### Scenario: No activity on an off day
- **WHEN** the campus page is read on a Tuesday for a deal that runs only on Fridays
- **THEN** no activity is made for that deal

### Requirement: A deal shows only while it runs
A deal's activity SHALL appear on the campus page only from its start until its end. Before the start and from the end onward, it SHALL NOT appear in the week list or on the Near you map.

#### Scenario: Before the start
- **WHEN** a student opens the campus page at 4:59pm for a 5:00pm–7:00pm deal
- **THEN** the deal's activity is not shown

#### Scenario: During the deal
- **WHEN** a student who stands in the deal's section opens the campus page at 5:02pm
- **THEN** the deal's activity is shown

#### Scenario: After the end
- **WHEN** a student opens the campus page at 7:00pm
- **THEN** the deal's activity is not shown

### Requirement: In the week list, a deal shows only to people standing near it
In the week list, a deal's activity SHALL be shown only when both of these hold:
- the browser has already granted location;
- the person's position falls in the same map section as the deal's place.

The campus page SHALL NOT ask for location in order to decide this. On the Near you map, a deal's activity SHALL be shown in its own section, like any activity at a known place.

#### Scenario: Location already allowed, in the section
- **WHEN** a student whose browser already allows location, and who stands on Roosevelt Island, opens the campus page during a Nisi Bistro deal
- **THEN** the deal's activity is in the week list

#### Scenario: Location not allowed
- **WHEN** a student whose browser has not granted location opens the campus page during the deal
- **THEN** no location prompt appears, and the deal's activity is not in the week list

#### Scenario: Elsewhere on the campus
- **WHEN** a student who stands in Long Island City opens the campus page during a Roosevelt Island deal
- **THEN** the deal's activity is not in the week list

#### Scenario: On the map of its section
- **WHEN** any student views the Roosevelt Island section of the Near you map during the deal
- **THEN** the deal's activity is shown there

### Requirement: The deal card leads with the deal
A deal's activity SHALL be shown on the approved card, in this order:
1. its title;
2. the deal line in large type;
3. an ink "Deal · N+ of you" pill and the time it ends ("until 7pm");
4. the place.

The card SHALL NOT use the words "happy hour". The group seats and their wording SHALL be the existing ones ("One more unlocks it", "N of M checked in", "Unlocked for your group").

#### Scenario: The card during the deal
- **WHEN** a student sees the Nisi Bistro deal at 5:02pm
- **THEN** the card reads "Drinks at Nisi Bistro", then "$2 off every drink", then "Deal · 2+ of you" and "until 7pm", then "Nisi Bistro"

### Requirement: The deal unlocks through the existing group reward
Joining, inviting, checking in at the place, unlocking, showing at the counter and marking as used SHALL behave for a deal's activity exactly as for any activity with a group reward. A deal SHALL unlock only when the group size has checked in at the place during its window.

#### Scenario: Two check in and it unlocks
- **WHEN** Ana and Maya are both in the Nisi Bistro activity and both check in within 150 m of Nisi Bistro at 5:44pm
- **THEN** both see "Unlocked for your group", and the top bar shows "Show at the counter" with "$2 off every drink" and Mark as used

#### Scenario: Joining is not unlocking
- **WHEN** Ana and Maya are both in, and neither has checked in
- **THEN** the card shows "0 of 2 checked in" and nothing is unlocked

### Requirement: Hiding a deal takes it off at once
Hiding a deal SHALL stop new days being made. If today's activity exists, hiding the deal SHALL also remove that activity from the campus page immediately.

#### Scenario: Hidden mid-window
- **WHEN** the admin hides the Nisi Bistro deal at 5:30pm
- **THEN** the deal's activity is no longer shown to anyone, and no activity is made for it the next day

### Requirement: Deals work before and without the migration
Until the deals migration has been run, the campus page SHALL behave as it does today. The admin's Deals tab SHALL say the migration must be run.

#### Scenario: Migration not yet run
- **WHEN** the campus page is opened on a database without the deals table
- **THEN** the page shows its usual list with no error

