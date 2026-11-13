## ADDED Requirements

### Requirement: Any member can propose an idea
A member with the right to post SHALL be able to propose an idea in a group, from the site or through an assistant with a read-and-write grant. An idea SHALL have a short name and a number of people it needs, between 2 and 20, defaulting to 3 and counting the proposer. It MAY have a start time, an end time, a place, a note, and days the proposer is offering. The proposer SHALL be counted as in. A member SHALL have at most 5 open ideas per group.

#### Scenario: Proposing through an assistant
- **WHEN** a member's assistant proposes "Buy suits" for Thursday at 15:00 at a named tailor, needing 3
- **THEN** the idea is saved in one call, the proposer is in, and the reply returns it with its share link

#### Scenario: An idea with no time
- **WHEN** a member proposes "Cooking class" with no time or place
- **THEN** it is saved as an open idea and others can say they are in

#### Scenario: Sixth open idea
- **WHEN** a member with 5 open ideas proposes another
- **THEN** nothing is saved and the reply says why

### Requirement: Members say they are in, and the group sees who
A member SHALL be able to say they are in on an idea and take it back, using the same interest mark as events. Members and followers of the group SHALL see who is in and how many more the idea needs. A person outside the group SHALL see no names.

#### Scenario: Assistant suggests an idea with a friend in it
- **WHEN** a member asks what is on Thursday and `@trip/stephen` is in on "Buy suits", which needs one more
- **THEN** the reply lists the idea, names `@trip/stephen`, and says it needs one more

### Requirement: An idea becomes a plan when it has the people, a time and a place
An idea SHALL become a plan at the moment it has at least the number of people it needs, a start time and a place. The check SHALL run inside the write that adds the last person or the last detail, so that concurrent writes produce exactly one transition. The transition SHALL enter the group's change sequence.

#### Scenario: The third person joins
- **WHEN** an idea needing 3 has a time, a place and 2 people in, and a third says they are in
- **THEN** it becomes a plan

#### Scenario: Two join at once
- **WHEN** two members say they are in at the same moment on an idea one short of its number
- **THEN** both are recorded, the idea becomes a plan once, and one set of invites is produced

#### Scenario: Details arrive last
- **WHEN** an idea already has enough people and its proposer adds the missing place
- **THEN** it becomes a plan on that write

### Requirement: A plan stays a plan
A plan SHALL remain a plan when a member drops out, even if the number in falls below the number needed. The proposer and the group's owners and organizers SHALL be able to cancel a plan and to change its time and place. A cancelled plan SHALL NOT be revived.

#### Scenario: Someone drops out
- **WHEN** a member drops out of a plan, leaving two people in a plan that needed three
- **THEN** it remains a plan and the group sees two people in

#### Scenario: Cancelling
- **WHEN** the proposer cancels a plan
- **THEN** it leaves the day's list and the change appears in what is new

### Requirement: Loop asks for a missing day and names a missing place
When an idea reaches the number it needs with no start time, Loop SHALL open one ask, attributed to the proposer, to the members who are in: a choice of days from those the proposer offered, or from the remaining days of the trip when none were offered. The ask SHALL close after 48 hours or when every member who is in has answered. The day with the most answers SHALL become the idea's day; on a tie the proposer SHALL choose. When an idea reaches its number with no place, Loop SHALL tell the proposer it needs a place and SHALL NOT open an ask for one. Loop SHALL open at most one ask per idea.

#### Scenario: Enough people, no day
- **WHEN** a third person says they are in on an idea with no start time and three offered days
- **THEN** an ask with those three days opens to the three members who are in

#### Scenario: A clear winner
- **WHEN** that ask closes with two answers for Thursday and one for Friday
- **THEN** the idea's day becomes Thursday and the proposer is asked to set the time

#### Scenario: Enough people, no place
- **WHEN** an idea reaches its number with a time and no place
- **THEN** no ask opens and the proposer is told the idea needs a place

#### Scenario: Only one ask
- **WHEN** an idea's day ask has closed and the idea later loses and regains a member
- **THEN** no second ask is opened

### Requirement: Ideas that go nowhere lapse
An idea that has not become a plan SHALL lapse 12 hours after its start time, or 14 days after it was proposed when it has no start time. A lapsed idea SHALL leave the lists and stay in the group's history.

#### Scenario: Undated idea after two weeks
- **WHEN** an idea with no start time is 14 days old and has not become a plan
- **THEN** it no longer appears among open ideas

### Requirement: What is on a given day
The system SHALL offer a read, on the site and through the connector, that returns for one day in the group's timezone: fixed events, plans, and open ideas for that day, each with who is interested or in, how many more an idea needs, and whether the caller is in. Ideas closest to their number SHALL come first among ideas. Loop SHALL return the list and SHALL make no recommendation.

#### Scenario: Thursday
- **WHEN** a member's assistant asks what is on Thursday
- **THEN** the reply lists Thursday's fixed events, plans and open ideas with names and numbers, in plain text that reads correctly when pasted into a chat

### Requirement: Ideas follow membership
When a member leaves a group, they SHALL be removed from every idea and plan they were in, their open ideas SHALL lapse, and plans they proposed SHALL pass to the group's owners and organizers. A person's export SHALL list the ideas they proposed and are in on.

#### Scenario: Proposer leaves
- **WHEN** the proposer of a plan leaves the group
- **THEN** the plan stays and the group's organizers can change or cancel it
