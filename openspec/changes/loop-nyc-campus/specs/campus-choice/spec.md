## ADDED Requirements

### Requirement: A school can have more than one campus
The system SHALL allow a campus to be part of a school that has another campus, sharing that school's email domains. Each campus SHALL have its own events, feeds, places, tags and map sections. A campus that is part of a school SHALL use that school's colours, and SHALL NOT be listed as a school of its own on the front door or the sign-in card. Cornell SHALL have two campuses: Ithaca and New York (Cornell Tech).

#### Scenario: The front door
- **WHEN** a signed-out visitor opens the front door
- **THEN** Cornell appears once and Cornell Tech does not appear as a separate school

#### Scenario: Colours
- **WHEN** a person placed at Cornell Tech opens their campus screen
- **THEN** it is drawn in Cornell's colours

#### Scenario: Separate weeks
- **WHEN** an event is listed at Cornell Tech
- **THEN** it does not appear on Ithaca's screen

### Requirement: Choosing a campus the first time
A signed-in person whose school has more than one campus and who has not been placed SHALL be shown one screen asking which campus, with one ticket per open campus, the campus nearest to where the person seems to be first. Each ticket SHALL show the campus's name, one line saying where it is, how many events are on there this week, and a picture of the place on its stub: the clocktower for Ithaca, the tram for New York. Picking a ticket SHALL place the person at that campus and open its screen. Until they pick, no campus screen SHALL open for them.

#### Scenario: First sign-in
- **WHEN** a person signs in for the first time with a verified cornell.edu address
- **THEN** they see "Which Cornell?" with a ticket for Ithaca and a ticket for New York

#### Scenario: The nearer campus is on top
- **WHEN** a person who seems to be in New York City sees the choice
- **THEN** the New York ticket is above the Ithaca ticket, and neither is picked for them

#### Scenario: No idea where they are
- **WHEN** nothing says where the person is
- **THEN** the Ithaca ticket is first

#### Scenario: Picking New York
- **WHEN** they pick the New York ticket
- **THEN** they are placed at Cornell Tech and its screen opens

#### Scenario: Opening a campus before choosing
- **WHEN** a cornell.edu person who has not chosen opens a campus screen by its address
- **THEN** they are sent to the choice

#### Scenario: A campus of another school
- **WHEN** a person submits a campus that is not one of their own school's
- **THEN** they are not placed there

#### Scenario: A school with one campus
- **WHEN** a person signs in with a verified columbia.edu address
- **THEN** they are placed at Columbia and are not asked to choose

### Requirement: Schools that are not open yet
The choice screen SHALL list the school's parts that are not open yet under "Coming soon". They SHALL NOT be pickable.

#### Scenario: Weill Cornell Medicine
- **WHEN** a Cornell person sees the choice
- **THEN** "Weill Cornell Medicine" is shown as coming soon and is not a button

### Requirement: Changing campus
A person whose school has more than one campus SHALL be able to change campus from their account card. Changing SHALL place them at the other campus and open its screen. What they did at the campus they left SHALL be kept. A person whose school has one campus SHALL NOT be offered the change.

#### Scenario: Ithaca to New York
- **WHEN** a person placed at Ithaca chooses "Change campus" and picks New York
- **THEN** they are placed at Cornell Tech and its screen opens

#### Scenario: Already placed before New York opened
- **WHEN** a person who was placed at Ithaca before Cornell Tech existed signs in
- **THEN** they land on Ithaca's screen and are not asked to choose

#### Scenario: One campus
- **WHEN** an NYU person opens their account card
- **THEN** there is no "Change campus"
