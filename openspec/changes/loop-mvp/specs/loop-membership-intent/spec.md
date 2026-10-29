# Spec Delta

## Purpose

Records how each person relates to each loop as a standing gradient of intent rather than a yes/no, and keeps the history of every change so conversion can be measured. Week-to-week availability is not intent; see `occurrence-rsvp`.

## ADDED Requirements

### Requirement: Loop is reachable by a public slug
Each loop SHALL have a stable public URL that opens its tap-in page showing the loop's title, weekly slot, place, and linked event. The public page and the waiting page SHALL show no member names and no member counts, with or without a drop token in the URL.

#### Scenario: Open by slug
- **WHEN** anyone opens `/l/<slug>` or `/l/<slug>?d=<token>` signed out
- **THEN** the tap-in page renders the facts and contains no names or counts

### Requirement: Tap-in requires one intent
The tap-in page SHALL present exactly three intents and require one: `crew_conditional` ("In if there's a crew", default), `going_want_crew` ("Going anyway, add me to a crew", sub-line "Already RSVPed on Luma or Partiful? Get a crew so you don't walk in alone."), `watching` ("Keep me in the loop"). The primary button text SHALL follow the selection.

#### Scenario: Default selection
- **WHEN** a person opens a loop's tap-in page
- **THEN** `crew_conditional` is preselected and the button reads "In if there's a crew"

#### Scenario: Button text follows intent
- **WHEN** the person selects `watching`
- **THEN** the button reads "Keep me in the loop"

### Requirement: Tap-in records an optional RSVP source
The tap-in page SHALL offer, under the intent, a one-line dropdown "Already RSVPed somewhere?" with `luma`, `partiful`, `campusgroups`, `other`, `none`, not required. The answer SHALL be stored on the membership, MAY be updated on re-tap-in, and SHALL be visible only to the organizer.

#### Scenario: Source recorded
- **WHEN** a person taps in with `going_want_crew` and picks "Luma"
- **THEN** the membership records `rsvp_source = luma` and no member-facing page shows it

#### Scenario: Left blank
- **WHEN** a person taps in without answering
- **THEN** `rsvp_source` is null

### Requirement: Signed-out tap-in preserves the chosen intent and drop
When a signed-out person taps in, the system SHALL ask for their email, send the sign-in link, and complete the tap-in with the originally chosen intent and drop token when they return, including when they pass through the first-name step.

#### Scenario: Round trip
- **WHEN** a signed-out person selects `watching` on `/l/<slug>?d=<token>`, enters their email, opens the link, and enters a first name
- **THEN** a membership exists with intent `watching` and that drop, and they land on their member page

### Requirement: Tap-in creates membership once
A signed-in tap-in SHALL create the membership with the chosen intent, a tap-in time, and the drop if any, all written once. Tapping in again to the same loop SHALL be treated as an intent change, not a new tap-in.

#### Scenario: First tap-in
- **WHEN** a signed-in person taps in
- **THEN** a membership exists with that intent and one history row with previous intent null

#### Scenario: Re-tap-in
- **WHEN** an existing member submits the tap-in page again with a different intent and a different drop token
- **THEN** the intent changes, a history row records the previous value, and the tap-in time and drop are unchanged

### Requirement: Tap-in is campus-scoped
The system SHALL refuse a tap-in when the person's campus differs from the loop's campus.

#### Scenario: Wrong campus
- **WHEN** a person from campus X taps into a loop of campus Y
- **THEN** the tap-in is rejected with a message that the loop is for another campus

### Requirement: Intent lives on the membership
Intent SHALL be stored per person × loop, so one person can be `watching` in one loop and `crew_conditional` in another.

#### Scenario: Different intents in two loops
- **WHEN** a person is `watching` loop A and taps into loop B as `crew_conditional`
- **THEN** loop A still reads `watching` and loop B reads `crew_conditional`

### Requirement: Every intent change is recorded
The system SHALL append an intent history row on every set or change, carrying the membership, previous intent (null on first tap-in), new intent, change time, and the loop's next occurrence at that moment. Setting the intent the member already has, and leaving (recorded by the departure time), SHALL append no row, so the transition and conversion metrics count only real changes; returning after leaving SHALL append one.

#### Scenario: Same intent again
- **WHEN** a member re-taps with the intent they already hold
- **THEN** no history row is added

#### Scenario: Upgrade from watching
- **WHEN** a `watching` member changes to `crew_conditional`
- **THEN** a history row exists with previous `watching`, new `crew_conditional`, and the next occurrence id

### Requirement: Members can change intent from their own page
A signed-in member SHALL be able to change their standing intent from their member page. Crew membership and this week's RSVP SHALL be unaffected by an intent change.

#### Scenario: Change from member page
- **WHEN** a crewed member sets their intent to `watching`
- **THEN** the intent is `watching`, the member stays in their crew, and crewmates see no change

### Requirement: Members can leave a loop
A member SHALL be able to leave a loop from their member page or any app-sent email. A member who left SHALL receive no further email for that loop, SHALL not be eligible for formation, SHALL no longer appear to crewmates, and SHALL keep their history and past attendance attributed to their crew.

#### Scenario: Leave
- **WHEN** a crewed member taps "Leave this loop"
- **THEN** crewmates no longer see them, they receive no reminder, and their past attendance still counts for that crew's statistics

#### Scenario: Return after leaving
- **WHEN** a member who left taps in again
- **THEN** the membership is reactivated with the chosen intent and no crew, the original drop is kept, and a history row records the change
