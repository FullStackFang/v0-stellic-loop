## ADDED Requirements

### Requirement: A school can have more than one campus
The system SHALL allow a campus to be part of a school that has another campus. People belong to the school by its email domains; a campus that is part of a school SHALL NOT place anyone by their address alone. Each campus SHALL have its own events, feeds, places, tags and map sections. A campus that is part of a school SHALL use that school's colours, and SHALL NOT be listed as a school of its own on the front door or the sign-in card. Cornell SHALL have two campuses: Ithaca and New York (Cornell Tech).

#### Scenario: The front door
- **WHEN** a signed-out visitor opens the front door
- **THEN** Cornell appears once and Cornell Tech does not appear as a separate school

#### Scenario: Colours
- **WHEN** a person placed at Cornell Tech opens their campus screen
- **THEN** it is drawn in Cornell's colours

#### Scenario: Separate weeks
- **WHEN** an event is listed at Cornell Tech
- **THEN** it does not appear on Ithaca's screen

### Requirement: A new person starts at the nearer campus
A signed-in person whose school has more than one campus and who has not been placed SHALL be placed, without being asked, at the campus of their school nearest to where they seem to be. Where they seem to be SHALL be the host's guess from the request, not the browser's location: the person SHALL NOT be prompted for their location to be placed, and the guess SHALL NOT be kept. With no guess they SHALL be placed at the school's first campus (Ithaca for Cornell). A person already placed SHALL stay where they are wherever they sign in from. There SHALL be no screen that asks which campus.

#### Scenario: Signing in from New York City
- **WHEN** a person signs in for the first time with a verified cornell.edu address and seems to be in New York City
- **THEN** they are placed at Cornell Tech and its screen opens

#### Scenario: Signing in from upstate
- **WHEN** a person signs in for the first time with a verified cornell.edu address and seems to be nearer Ithaca
- **THEN** they are placed at Ithaca and its screen opens

#### Scenario: No idea where they are
- **WHEN** nothing says where the person is
- **THEN** they are placed at Ithaca

#### Scenario: Placed, then travelling
- **WHEN** a person placed at Ithaca signs in from New York City
- **THEN** their campus is still Ithaca

#### Scenario: A school with one campus
- **WHEN** a person signs in with a verified columbia.edu address from anywhere
- **THEN** they are placed at Columbia

### Requirement: Looking at another campus
A signed-in person SHALL be able to open every campus of their own school, and to join and post there, without their own campus changing. Where a school has more than one campus, the map's head SHALL carry one control that names the campus on the page and offers one ticket per campus, each with how many events are on there this week; the person's own campus SHALL be marked as theirs. On a campus that is not the person's own, the map SHALL say they are visiting unless they are standing in one of its sections. A campus of another school SHALL NOT open for them.

#### Scenario: Ithaca person looks at New York
- **WHEN** a person whose campus is Ithaca presses the control on the map and picks New York
- **THEN** Cornell Tech's screen opens, the map says "Visiting", and their own campus is still Ithaca

#### Scenario: Standing there
- **WHEN** a person whose campus is Ithaca looks at New York while standing on Roosevelt Island
- **THEN** the map says "You are here"

#### Scenario: Another school
- **WHEN** an NYU person opens Cornell Tech's screen by its address
- **THEN** it does not open

#### Scenario: One campus
- **WHEN** a Columbia person opens the map
- **THEN** there is no such control

### Requirement: Changing campus
A person whose school has more than one campus SHALL be able to change their own campus from their account card. Changing SHALL make the other campus theirs and open its screen. What they did at the campus they left SHALL be kept, and that campus SHALL stay open for them to look at. A person whose school has one campus SHALL NOT be offered the change. Looking at another campus SHALL NOT change a person's own campus.

#### Scenario: Ithaca to New York
- **WHEN** a person placed at Ithaca chooses "Change campus" and picks New York
- **THEN** they are placed at Cornell Tech and its screen opens

#### Scenario: The campus they left
- **WHEN** that person then opens Ithaca's screen
- **THEN** it opens, and the map says they are visiting

#### Scenario: Already placed before New York opened
- **WHEN** a person who was placed at Ithaca before Cornell Tech existed signs in
- **THEN** they land on Ithaca's screen, and may change to New York from their account card

#### Scenario: A campus of another school
- **WHEN** a person submits a campus that is not one of their own school's
- **THEN** they are not placed there

#### Scenario: One campus
- **WHEN** an NYU person opens their account card
- **THEN** there is no "Change campus"
