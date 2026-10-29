# Spec Delta

## Purpose

The one page a member returns to each week: the facts of the next meeting, who is in their crew and whether they are coming, and the member's own controls. It shows nothing about other members beyond first names and this week's RSVP.

## ADDED Requirements

### Requirement: Member page shows the next meeting's facts
The member page SHALL show the loop title, the next occurrence's date and time in the campus time zone, the place, and the effective linked URL for that occurrence as a link (with the cached preview when one exists).

#### Scenario: Upcoming occurrence
- **WHEN** a member opens their page on a Tuesday for a loop that meets Thursdays 7pm
- **THEN** the page shows this Thursday's date and 7:00 PM, the place, and the link

#### Scenario: Occurrence link override
- **WHEN** the next occurrence has its own linked URL different from the loop default
- **THEN** the page links the occurrence's URL, not the loop default

#### Scenario: One-off loop after the date
- **WHEN** a one-off loop's single occurrence has ended
- **THEN** the page shows the date as past and no RSVP controls

### Requirement: Crewed members see their crew by first name with this week's RSVP
When the member is in a crew, the page SHALL list that crew's active members by first name only, marking the viewer as "(you)" and showing each member's RSVP for the next occurrence as In, Out, or No reply. It SHALL never show emails, intent values, drops, or members of other crews.

#### Scenario: Member list
- **WHEN** a crew has Sarah, Josh, Maya, and Lydia, Josh answered Out, Maya answered In, and Sarah views the page
- **THEN** the page shows "Sarah (you) · No reply, Josh · Out, Maya · In, Lydia · No reply" with no emails or intents

#### Scenario: No intent values in the crew list
- **WHEN** any member page is rendered
- **THEN** no intent value appears anywhere in the crew list region

### Requirement: RSVP controls for the next occurrence
When the member is in a crew, the page SHALL offer "I'm in" and "Can't this week" for the next occurrence and show the viewer's current answer.

#### Scenario: Tap I'm in
- **WHEN** the viewer taps "I'm in"
- **THEN** their status shows In without leaving the page

### Requirement: Waiting state when not crewed
When the member is not in a crew, the page SHALL show the loop facts, their intent control, and the line "You're in the pool. Crews are set by the organizer before each week." It SHALL show no names, no counts, and no RSVP controls.

#### Scenario: Waiting member
- **WHEN** a `crew_conditional` member opens the loop before crews form
- **THEN** they see the waiting line and their intent control, and the HTML contains no other member's first name

### Requirement: Own intent is editable in place
The member page SHALL show the viewer's standing intent and allow changing it without leaving the page. When opened with the focus flag from an email, the intent control SHALL be focused.

#### Scenario: Change intent
- **WHEN** the viewer selects a different intent
- **THEN** the membership updates, a history row is written, and the page reflects the new state

### Requirement: Leave control
The member page SHALL offer "Leave this loop".

#### Scenario: Leave
- **WHEN** the viewer confirms leaving
- **THEN** the page shows a left state with a way to tap back in

### Requirement: Member page requires sign-in and membership
The member page SHALL be visible only to a signed-in member of that loop. Anyone else SHALL be redirected to the public tap-in page.

#### Scenario: Non-member opens the member page
- **WHEN** a signed-in person with no membership opens `/l/<slug>/me`
- **THEN** they are redirected to `/l/<slug>`
