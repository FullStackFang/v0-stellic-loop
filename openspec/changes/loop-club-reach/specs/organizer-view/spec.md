## ADDED Requirements

### Requirement: Organizers see interest building per event
A group's owners and organizers SHALL have a page listing upcoming events, each with its count of interested members and how that count has changed by day since the event was added. The page SHALL count members and SHALL NOT rank or list members by activity.

#### Scenario: Interest over a week
- **WHEN** an organizer opens the page for an event added seven days ago
- **THEN** they see the current count and the count on each of the seven days

#### Scenario: Ordinary member
- **WHEN** a member who is not an owner or organizer requests the page
- **THEN** it is not shown to them

### Requirement: Organizers see answers arriving per ask
The page SHALL list open asks, each with answers received against members expected and time left. The list of who has not answered SHALL remain inside each ask, under the rules of `group-asks`; the page SHALL NOT combine it across asks.

#### Scenario: Two open asks
- **WHEN** an organizer opens the page with two open asks
- **THEN** each shows "answered of expected" and its closing time, with a link into the ask

#### Scenario: No per-member table
- **WHEN** the page is rendered
- **THEN** it contains no row per member and no measure of any member's responsiveness

### Requirement: Organizers can announce from the view
An owner or organizer SHALL be able to post an announcement from the page, optionally about one event, and choose whether to send it to members. A sent announcement SHALL follow each member's reach choice and the sending limits.

#### Scenario: Announce to interested members' group
- **WHEN** an organizer writes an announcement about an event and ticks "send to members"
- **THEN** it is posted to the group and sent to members whose choice allows it

#### Scenario: Post without sending
- **WHEN** the organizer leaves "send to members" unticked
- **THEN** it is posted and nothing is sent
