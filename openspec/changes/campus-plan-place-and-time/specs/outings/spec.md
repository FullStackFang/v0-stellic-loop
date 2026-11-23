## MODIFIED Requirements

### Requirement: Saying you are in
A signed-in person SHALL be able to press "I'm in" on a plan or an event, which puts them in an outing for that event. If a person they know already has an outing on that event, they SHALL join it; with several, the one holding the most people they know. Otherwise a new outing SHALL be started with them in it. After joining, the event's panel SHALL open on "Invite people", except on a plan whose time is not set, where the plan SHALL show "When works for you?" first.

#### Scenario: A friend is already going
- **WHEN** a person presses "I'm in" on an event where someone who shares a group with them has an outing
- **THEN** they are added to that outing

#### Scenario: Nobody they know is going
- **WHEN** a person presses "I'm in" on an event where nobody they know has an outing
- **THEN** a new outing is created with them in it

#### Scenario: Pressing twice
- **WHEN** a person already in an outing for an event presses "I'm in" on it again
- **THEN** no new outing is created

#### Scenario: A plan with no time yet
- **WHEN** a person presses "I'm in" on a plan posted for Tuesday with no time
- **THEN** they are in it and the plan shows them "When works for you?" with Tuesday's times
