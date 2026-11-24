## MODIFIED Requirements

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
