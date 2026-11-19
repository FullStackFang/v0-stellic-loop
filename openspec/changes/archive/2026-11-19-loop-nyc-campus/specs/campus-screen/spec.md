## ADDED Requirements

### Requirement: The map shows one day
The "Near you" map SHALL show the plans of one day of the section in view. When the section has plans on more than one day, the band over the map SHALL carry a pill for each of those days, with how many plans are on that day, and SHALL name the day shown beside its count. The map SHALL open on the first day that has anything on. Pressing a pill SHALL change the map to that day. A plan picked in the list or opened from anywhere on the screen SHALL bring the map to that plan's day and section. The pills SHALL NOT be shown while a ticket is open over the map, or when the section has plans on one day only.

#### Scenario: A week in one section
- **WHEN** a person opens "Near you" on a section with plans today and on Saturday
- **THEN** the map shows today's stamps only, and the band has a "Today" pill and a "Sat" pill, each with its count

#### Scenario: Another day
- **WHEN** that person presses the "Sat" pill
- **THEN** the map shows Saturday's stamps and no others, and the band says how many are on Saturday

#### Scenario: Picked in the list
- **WHEN** the map is on today and the person picks a Saturday plan in the list beside it
- **THEN** the map changes to Saturday and that plan's stamp is the one that is on

#### Scenario: One day only
- **WHEN** every plan in the section is on the same day
- **THEN** the band shows no day pills

### Requirement: Something already on is under Today
A plan that has started and has not ended SHALL be on the map under Today, whichever day it started. A plan's day on the map SHALL be the day it starts, or today when it has already started. A day more than six days ahead SHALL be named with its date as well as its weekday.

#### Scenario: Began last week
- **WHEN** today is Thursday, an exhibition began last Saturday and runs into next week, and a market is this Saturday
- **THEN** the exhibition's stamp is on the map under Today, the market's is under "Sat", and the map opens on Today

### Requirement: One stamp for one address
Plans on the same day at the same address SHALL share one stamp, standing on that address. The stamp SHALL show one of those plans and how many plans are there. The ticket of the plan shown SHALL carry an "Also here" pill naming the next plan at that address and its time; pressing it SHALL turn the stamp to that plan. Beside the list, turning the stamp SHALL also pick that plan in the list, and pointing at any of those plans in the list SHALL lift the shared stamp. A plan alone at its address SHALL have a stamp with no count and no "Also here" pill.

#### Scenario: Two plans, one address
- **WHEN** Bagels at 10am and Chess at 2pm are on the same day at the same address
- **THEN** the map has one stamp there marked 2, and the ticket for Bagels has a pill reading "Also here: Chess, 2pm"

#### Scenario: Turning the stamp
- **WHEN** the person presses that pill
- **THEN** the stamp and its ticket show Chess, and the pill now names Bagels

#### Scenario: Alone at its address
- **WHEN** a plan is the only one at its address that day
- **THEN** its stamp has no count and its ticket has no "Also here" pill

### Requirement: A stamp and its ticket shrink from the spot
When the map is zoomed out, a stamp, the faces and postmark on it, and its ticket SHALL shrink together toward the stamp's address, the stamp that is on included, so that no stamp moves off its address. When the stamps are small, the ticket SHALL fade away, and its "Also here" pill SHALL NOT answer a press while the ticket is hidden. Zooming back in SHALL bring the ticket back.

#### Scenario: The whole section in view
- **WHEN** a person zooms out until the whole of Roosevelt Island is in view
- **THEN** every stamp is small and still on its address, and no ticket is showing

#### Scenario: Hidden ticket
- **WHEN** the ticket has faded and the person presses the map where its "Also here" pill was
- **THEN** the stamp does not turn to another plan

#### Scenario: Zooming back in
- **WHEN** that person zooms back in on a stamp that is on
- **THEN** the stamp grows from its address and its ticket shows again
