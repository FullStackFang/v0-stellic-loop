## MODIFIED Requirements

### Requirement: Owners and organizers manage events from the site or an assistant
An owner or organizer SHALL be able to add, change and archive events on the site, and through an assistant that holds a read-and-write grant for that group. A member who is not an owner or organizer SHALL NOT be able to change or archive events by either route, and SHALL be able to add an event only by giving a link or by marking interest in a nearby item, as the `event-links` and `nearby-events` capabilities define; such a member SHALL also be able to take back a linked event they added, as `event-links` defines. No other organizer action SHALL become available to an assistant through this requirement.

#### Scenario: Organizer adds an event through their assistant
- **WHEN** an organizer's assistant with a read-and-write grant calls the add-event tool with a name and a start time
- **THEN** the event is saved, the reply returns it in full, and the change log names the assistant

#### Scenario: Member's assistant cannot add an event
- **WHEN** an ordinary member's assistant calls the add-event tool
- **THEN** nothing is saved and the reply says only owners and organizers can add events

#### Scenario: Member adds an event by link
- **WHEN** an ordinary member's assistant with a read-and-write grant calls the link tool with a readable event link
- **THEN** the event is saved and the member is interested in it

#### Scenario: Member cannot change a linked event
- **WHEN** an ordinary member tries to change the time of an event they linked
- **THEN** nothing is saved and the reply says only owners and organizers can change events

#### Scenario: Brief stays site-only
- **WHEN** an organizer's assistant attempts to change the group's brief
- **THEN** the attempt is refused as it was before this change
