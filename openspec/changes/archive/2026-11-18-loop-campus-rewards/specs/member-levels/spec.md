## ADDED Requirements

### Requirement: Three levels earned by outings
Every signed-in person SHALL have one of three levels, set by the number of their outings that count: Member from 0, Regular from 5, Insider from 15. The level SHALL be counted from check-in records and SHALL NOT be bought.

#### Scenario: New person
- **WHEN** a person has no outings that count
- **THEN** their level is Member

#### Scenario: Fifth outing
- **WHEN** a person's fifth outing counts
- **THEN** their level is Regular

#### Scenario: An outing alone
- **WHEN** a person with four counted outings checks in on an outing where nobody else checks in
- **THEN** their level stays Member

### Requirement: The level lives on the avatar
The system SHALL show a person's level as a small numbered badge on their avatar in the top bar, and SHALL NOT give levels any other space on the page. Pressing the avatar SHALL open a level card with their photo, name, level, the number of outings, progress to the next level, and the three levels with what each gets. Pressing outside the card SHALL close it.

#### Scenario: Badge
- **WHEN** a Regular views the campus screen
- **THEN** their avatar carries a badge reading 2

#### Scenario: Open the card
- **WHEN** a Regular with 11 outings presses their avatar
- **THEN** a card shows "Regular", 11 outings, and 4 more to Insider

#### Scenario: Top level
- **WHEN** an Insider opens the card
- **THEN** it shows their level and no next level to reach

### Requirement: A level changes the reward, not what is hidden
A reward SHALL be able to carry a different text for each level. A person SHALL see only the text for their own level. When a reward has no text for a person's level, the nearest lower level's text SHALL be used; when there is none at or below their level, the reward SHALL NOT be shown to them. The system SHALL NOT show a person a higher level's version as something to unlock.

#### Scenario: Better version for a Regular
- **WHEN** a reward reads "$4.50 each" for Members and "$4.00 each" for Regulars
- **THEN** a Regular's ticket reads "$4.00 each" and a Member's reads "$4.50 each"

#### Scenario: Panel says so
- **WHEN** a Regular opens an event whose reward is better at their level
- **THEN** the panel says their Regular level makes it better than the standard reward

#### Scenario: No teasing
- **WHEN** a Member views that event
- **THEN** nothing on the ticket or the panel mentions the Regular or Insider version
