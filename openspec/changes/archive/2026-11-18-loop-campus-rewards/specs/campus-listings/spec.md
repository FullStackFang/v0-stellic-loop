## ADDED Requirements

### Requirement: One list of events for a campus
The system SHALL show, at `/c/[campus]`, one list of that campus's upcoming events for the next seven days in the campus timezone. The list SHALL hold events from feeds, plans posted by people and events entered by hand together, with no split by kind and no category tabs. Hidden, cancelled and ended events SHALL be left out.

#### Scenario: Mixed sources in one list
- **WHEN** a campus has a feed event today, a posted plan tomorrow and a hand-entered event on Friday
- **THEN** all three appear in the same list

#### Scenario: Ended event
- **WHEN** an event's end time has passed
- **THEN** it is not in the list

#### Scenario: Unknown campus
- **WHEN** a visitor opens `/c/` followed by a slug that matches no campus
- **THEN** the system responds with not found

### Requirement: Events imported from calendar feeds
The system SHALL read every feed that is on, once an hour, and SHALL create or update one event per feed item that starts within the next 30 days, matched by feed and feed item id. An event that has left its feed SHALL be hidden, not deleted. A feed that fails SHALL leave its events unchanged, SHALL have the failure recorded on it, and SHALL NOT stop other feeds from being read.

#### Scenario: New feed item
- **WHEN** a feed contains an item starting in three days that Loop has not seen
- **THEN** an event is created with its title, about text, host name, place text, start and end

#### Scenario: Changed feed item
- **WHEN** a feed item Loop has already imported changes its start time
- **THEN** the same event is updated and its outings are kept

#### Scenario: Item removed from the feed
- **WHEN** a feed item with an outing on it is no longer in the feed
- **THEN** the event is hidden from the list and its outing still exists

#### Scenario: One feed fails
- **WHEN** one of a campus's two feeds returns an error
- **THEN** the other feed is still read and the failure is shown on the admin page

#### Scenario: Item too far ahead
- **WHEN** a feed item starts 45 days from now
- **THEN** no event is created for it

### Requirement: Source label without a link out
An event from a feed SHALL show a label with its source name (CampusGroups or Luma) and its host name. The system SHALL NOT show a link to the source's page for a feed event.

#### Scenario: CampusGroups event
- **WHEN** a person views an event imported from a CampusGroups feed
- **THEN** it shows a "CampusGroups" label and the host club's name, and no link that leaves Loop

#### Scenario: Posted plan
- **WHEN** a person views a plan posted by a person
- **THEN** it shows no source label

### Requirement: Places and the map
The system SHALL keep a list of named places per campus with coordinates, and SHALL match an event's place text to that list by name or by another name the place goes by. An opened event whose place is matched SHALL show a map centred on that place with the place name under it. An event whose place is not matched SHALL show its place text and no map.

#### Scenario: Matched place
- **WHEN** a person opens an event whose place text is "Arts Quad" and the campus has a place of that name
- **THEN** the panel shows a map centred on the Arts Quad

#### Scenario: Unmatched place
- **WHEN** a person opens an event whose place text matches no place on the list
- **THEN** the panel shows the place text and no map

### Requirement: Signed-out view
A visitor who is not signed in SHALL see the list, each event's reward and how many people are in. The system SHALL NOT show them any person's name or photo. Any action SHALL send them to sign in and return them to the same screen.

#### Scenario: Looking while signed out
- **WHEN** a signed-out visitor opens the campus screen
- **THEN** they see events and rewards with counts, and no names or faces

#### Scenario: Acting while signed out
- **WHEN** a signed-out visitor presses "I'm in"
- **THEN** they are sent to sign in and afterwards returned to the campus screen

### Requirement: Managing a campus by hand
The admin SHALL be able to add a campus, add feeds and turn them on or off, add and change places, add an event by hand, edit any event's "good for" words, and hide or unhide any event. The system SHALL refuse these actions from anyone who is not the admin.

#### Scenario: Hide a duplicate
- **WHEN** the admin hides one of two copies of the same event
- **THEN** that copy no longer appears in the list

#### Scenario: Words edited by hand survive import
- **WHEN** the admin has edited a feed event's "good for" words and the feed is read again
- **THEN** the edited words are kept

#### Scenario: Not the admin
- **WHEN** a signed-in person who is not the admin opens the campus admin page or calls one of its actions
- **THEN** the system refuses
