## ADDED Requirements

### Requirement: A member states their own travel for a group
A member with the right to post SHALL be able to save one travel entry per group: an arrival day, time and place; a departure day, time and place; and optionally a flight number for each and where they are staying. Every field SHALL be optional except that an entry needs at least an arrival or a departure. A member SHALL be able to change or delete their entry, from the site or through an assistant with a read-and-write grant. Nobody SHALL be able to write another person's entry.

#### Scenario: Telling the group a flight through an assistant
- **WHEN** a member's assistant saves "arriving Hanoi, March 3 at 14:20, VN 54"
- **THEN** the entry is saved in one call and the reply returns it in full

#### Scenario: Writing for someone else is refused
- **WHEN** a member or organizer tries to save a travel entry for another member
- **THEN** nothing is saved

#### Scenario: Deleting it
- **WHEN** a member deletes their travel entry
- **THEN** it no longer appears to anyone

### Requirement: Travel is visible inside the group only
Members and followers of the group SHALL be able to read every member's travel entry for that group. A person who is not in the group SHALL NOT be able to read any entry, by any page, link, feed or tool. Each entry SHALL show when it was last changed.

#### Scenario: Member reads arrivals
- **WHEN** a member asks who is arriving
- **THEN** the reply lists entries in time order with each person's handle, or "a teammate" when they have none, and the date each was last changed

#### Scenario: Not in the calendar feed
- **WHEN** a member's calendar feed for the group is fetched
- **THEN** it contains no travel entry

### Requirement: The arrivals read marks who lands near the caller
The arrivals read SHALL mark, for the calling member, other members whose stated arrival is at the same place within two hours either side of the caller's, and the same for departures. Loop SHALL state nothing about any member beyond what that member entered.

#### Scenario: Landing together
- **WHEN** the caller arrives at Hanoi at 14:20 and another member's entry says Hanoi at 15:05
- **THEN** that member is marked as arriving around the same time

#### Scenario: No entry, nothing said
- **WHEN** a member has saved no travel entry
- **THEN** the read lists nothing for them and makes no statement about them

### Requirement: Travel follows membership
When a member leaves a group, or deletes their account, their travel entry for that group SHALL be deleted. A person's export SHALL include their travel entries.

#### Scenario: Leaving the trip
- **WHEN** a member leaves the group
- **THEN** their travel entry is gone from every read
