# outings Specification

## Purpose
TBD - created by archiving change loop-campus-rewards. Update Purpose after archive.
## Requirements
### Requirement: Saying you are in
A signed-in person SHALL be able to press "I'm in" on a plan or an event, which puts them in an outing for that event. If a person they know already has an outing on that event, they SHALL join it. With several such outings, they SHALL join the one whose people they have been out with most: each person they know in an outing scores one plus the number of times the two have been out together, and the outing with the highest total is joined. A tie SHALL go to the outing holding more people they know, then to the older outing. Otherwise a new outing SHALL be started with them in it. After joining, the event's panel SHALL open on "Invite people".

#### Scenario: A friend is already going
- **WHEN** a person presses "I'm in" on an event where someone who shares a group with them has an outing
- **THEN** they are added to that outing

#### Scenario: Nobody they know is going
- **WHEN** a person presses "I'm in" on an event where nobody they know has an outing
- **THEN** a new outing is created with them in it

#### Scenario: Pressing twice
- **WHEN** a person already in an outing for an event presses "I'm in" on it again
- **THEN** no new outing is created

#### Scenario: A regular beats three group mates
- **WHEN** an event has one outing holding three people from the person's group they have never been out with, and another holding one person they have been out with six times
- **THEN** pressing "I'm in" adds them to the outing with the person they have been out with six times

#### Scenario: Nobody has been out together
- **WHEN** an event has two outings and the person has been out with nobody in either
- **THEN** they join the one holding more people they know, as before

### Requirement: Registering for a feed event inside Loop
For an event from a feed, the action SHALL read "Register" and SHALL open the event's panel, where "Register me" puts the person in an outing marked as registered. The system SHALL NOT send the person to the source's site and SHALL NOT state that the organizer has been told.

#### Scenario: Register me
- **WHEN** a person presses "Register me" on a CampusGroups event
- **THEN** they are in an outing for it, marked as registered, and the panel shows "Invite people"

#### Scenario: Wording
- **WHEN** a person has registered for a feed event
- **THEN** the screen says their spot is saved in Loop and does not say the organizer was notified

### Requirement: One outing per event
A person SHALL be in at most one outing per event. Joining a second outing for the same event SHALL move them to it.

#### Scenario: Joining a second group
- **WHEN** a person in one outing for an event joins another outing for that event from a share link
- **THEN** they are removed from the first and are in the second

### Requirement: Inviting people
A person in an outing SHALL be shown up to four people they know who are not in it, each with how they know them and an "Invite" control, and a share link to copy. People already invited SHALL come first; after them, the people the person has been out with most SHALL come first. Pressing "Invite" SHALL record the invite. An invited person SHALL see that event among their best, with the inviter's face in its seats. The system SHALL NOT send an email or a text.

#### Scenario: Invite a friend
- **WHEN** a person presses "Invite" beside a friend's name
- **THEN** the control reads "Invited" and the friend sees that event among their best

#### Scenario: Undo an invite
- **WHEN** a person presses "Invited" before the friend has joined
- **THEN** the invite is removed

#### Scenario: Copy the link
- **WHEN** a person presses "Copy link"
- **THEN** the outing's share link is on their clipboard and the control says it was copied

#### Scenario: Order of the suggestions
- **WHEN** a person knows Bea and Kai from a group, has been out with Dev six times and with Noor three times, and none is invited
- **THEN** the list reads Dev, Noor, then Bea and Kai

#### Scenario: More than four
- **WHEN** a person knows six people who are not in the outing
- **THEN** the four they have been out with most are shown

### Requirement: Joining from the share link
The share link `/o/[token]` SHALL open the campus screen with that event's panel open and a "Join" action. A signed-in person who presses "Join" SHALL be added to that outing. An unknown token SHALL respond with not found.

#### Scenario: Friend joins
- **WHEN** a signed-in person opens a share link and presses "Join"
- **THEN** they are in that outing and see the first names of the others in it

#### Scenario: Signed-out friend opens the link
- **WHEN** a signed-out visitor opens a share link
- **THEN** they see the event, its reward and how many are in, with no names, and pressing "Join" sends them to sign in and back

#### Scenario: Unknown link
- **WHEN** a visitor opens a share link whose token matches no outing
- **THEN** the system responds with not found

### Requirement: Leaving an outing
A person SHALL be able to leave an outing they have not checked in on.

#### Scenario: Leave before checking in
- **WHEN** a person in an outing who has not checked in presses "Leave"
- **THEN** they are no longer in it and the seat they held is empty

### Requirement: Checking in
A person in an outing SHALL be able to press "Check in" from 30 minutes before the event's start until its end, in the campus timezone. An event with no end time SHALL end two hours after its start. Checking in SHALL need nothing but the press: no code, no scan and no location. Outside the window the system SHALL refuse.

#### Scenario: Check in during the event
- **WHEN** a member of an outing presses "Check in" 10 minutes after the event started
- **THEN** they are recorded as checked in with the time, and their face is marked on the ticket

#### Scenario: No end time
- **WHEN** a member of a plan that starts at 5pm with no end time presses "Check in" at 6:30pm
- **THEN** they are recorded as checked in

#### Scenario: Too early
- **WHEN** it is two hours before the event starts
- **THEN** the ticket shows no "Check in" button, and a direct attempt is refused

#### Scenario: Not in the outing
- **WHEN** a signed-in person who is not in an outing tries to check in on it
- **THEN** the system refuses

#### Scenario: Checking in twice
- **WHEN** a member who has checked in presses "Check in" again
- **THEN** the first check-in time is kept and nothing else changes

### Requirement: Who sees whom
The system SHALL show a signed-in person the first names and photos of people they know who are in an event, and of everyone in their own outing with who has checked in. A person they know is one who shares a group with them or has checked in on an outing with them before. Everyone else SHALL be shown as a count.

#### Scenario: A friend is going
- **WHEN** a person views an event that someone from one of their groups is in
- **THEN** they see that person's face on the ticket and their first name in the panel

#### Scenario: Strangers are going
- **WHEN** a person views an event that only people they do not know are in
- **THEN** they see how many are going and no names or faces

#### Scenario: No photo
- **WHEN** a person shown on a ticket has no photo on their account
- **THEN** their initial is shown in its place

### Requirement: Outings that count
An outing SHALL count for a person, toward building rewards and levels, only when that person checked in and at least one other person of the same outing checked in too.

#### Scenario: Two checked in
- **WHEN** two people of one outing check in
- **THEN** the outing counts for both

#### Scenario: Alone
- **WHEN** one person of an outing checks in and nobody else does
- **THEN** the outing does not count for them

