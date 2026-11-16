## ADDED Requirements

### Requirement: Events carry a date, a place and a link
An event SHALL be able to carry a start time, an end time, a place, a link and a short note, each optional. An event with no start time SHALL keep working as a label for records. Times SHALL be stored as instants and shown in the group's timezone. An end time SHALL NOT be earlier than the start time.

#### Scenario: Organizer adds a dated event on the site
- **WHEN** an organizer saves an event named "Spring mixer" with a start time and a place
- **THEN** the event is saved and appears in the group's upcoming events, ordered by start time

#### Scenario: End before start is refused
- **WHEN** an event is saved with an end time earlier than its start time
- **THEN** nothing is saved and the reply says which value is wrong

#### Scenario: Undated event still labels records
- **WHEN** a member files an output under an event that has no start time
- **THEN** the output is saved under that event as before

### Requirement: Owners and organizers manage events from the site or an assistant
An owner or organizer SHALL be able to add, change and archive events on the site, and through an assistant that holds a read-and-write grant for that group. A member who is not an owner or organizer SHALL NOT be able to add, change or archive events by either route. No other organizer action SHALL become available to an assistant through this requirement.

#### Scenario: Organizer adds an event through their assistant
- **WHEN** an organizer's assistant with a read-and-write grant calls the add-event tool with a name and a start time
- **THEN** the event is saved, the reply returns it in full, and the change log names the assistant

#### Scenario: Member's assistant cannot add an event
- **WHEN** an ordinary member's assistant calls the add-event tool
- **THEN** nothing is saved and the reply says only owners and organizers can add events

#### Scenario: Brief stays site-only
- **WHEN** an organizer's assistant attempts to change the group's brief
- **THEN** the attempt is refused as it was before this change

### Requirement: Upcoming events are listed with interest
The system SHALL list a group's events that have not ended, soonest first, at most 30, each with its facts, the number of interested members, and whether the caller is interested. The list SHALL be available on the group page and through a connector tool. Events with no start time SHALL be listed after dated ones.

#### Scenario: Member asks what is coming up
- **WHEN** a member's assistant with a read grant calls the events tool for a group with three upcoming events
- **THEN** the reply lists the three events soonest first, each with date, place, the count interested, and whether the caller is interested, in plain text that reads correctly when pasted into a chat

#### Scenario: Past events drop off
- **WHEN** an event's end time, or its start time when it has no end, is more than 12 hours past
- **THEN** it no longer appears in the upcoming list

### Requirement: A member can say they are interested and take it back
A member with the right to post SHALL be able to mark themselves interested in an event and to remove that mark, from the site or through an assistant with a read-and-write grant. Interest SHALL be a single on or off state per member per event. A person SHALL NOT be able to set interest for anyone else.

#### Scenario: Marking interest twice is harmless
- **WHEN** a member marks interest in an event they are already interested in
- **THEN** the state stays on and the reply says so

#### Scenario: Taking it back
- **WHEN** a member removes their interest
- **THEN** they no longer appear among the interested and the count drops by one

#### Scenario: A follower cannot mark interest
- **WHEN** a follower, who can read and cannot post, tries to mark interest
- **THEN** nothing is saved and the reply says why

### Requirement: Members see who is interested; others see at most a count
Members and followers of a group SHALL be able to see which members are interested in an event. An assistant SHALL receive each interested person as their handle, or as "a teammate" when they have none; person identifiers SHALL NOT be returned. A person who is not in the group SHALL see no names, and SHALL see a count of interested members only when the count is five or more.

#### Scenario: A friend's interest is shown to a member
- **WHEN** a member asks about an event that the member with handle `@club/stephen` is interested in
- **THEN** the reply names `@club/stephen` among the interested and says whether the caller is interested

#### Scenario: Non-member below the floor
- **WHEN** a person who is not in the group opens an event's share page and three members are interested
- **THEN** the page shows the event's name, time and place and says nothing about interest

#### Scenario: Non-member at the floor
- **WHEN** a person who is not in the group opens an event's share page and six members are interested
- **THEN** the page shows "6 interested" and no names

### Requirement: Dated events have a share link
Each dated event SHALL have a share link with an unguessable token. The link SHALL grant no access and no membership. The page and its link preview SHALL show a person who is signed out or not in the group only what a non-member may see. The site SHALL offer a "Send to WhatsApp" control that opens WhatsApp with a message and the link filled in, and a copy-link control. Loop SHALL send nothing itself.

#### Scenario: Member opens the link
- **WHEN** a signed-in member opens an event's share link
- **THEN** the page shows the event, who is interested, and a control to mark or remove their own interest

#### Scenario: Signed-out visitor opens the link
- **WHEN** a signed-out person opens the link
- **THEN** the page shows the non-member view and a way to sign in, and no member's name appears in the page or its preview

### Requirement: New and changed events appear in what is new
Adding an event, changing its time or place, and archiving it SHALL each enter the group's change sequence and be returned by `whats_new`. Changes of interest SHALL NOT enter the sequence.

#### Scenario: New event since the cursor
- **WHEN** an organizer adds an event after a member's last cursor
- **THEN** that member's next `whats_new` includes the event with its date and place

#### Scenario: Interest is not a change
- **WHEN** five members mark interest in an event
- **THEN** `whats_new` returns no entry for those marks

### Requirement: Interest follows membership
When a member leaves a group or deletes their account, their interest in that group's events SHALL be removed. A person's export SHALL list the events they are interested in.

#### Scenario: Leaving removes interest
- **WHEN** a member who is interested in two events leaves the group
- **THEN** neither event lists them and both counts drop by one
