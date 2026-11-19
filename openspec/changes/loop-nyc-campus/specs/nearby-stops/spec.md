## ADDED Requirements

### Requirement: New York sections
The "Near you" map SHALL have sections for the New York campus, one per subway stop, each covering what that stop serves, starting with Roosevelt Island, Lexington Av/63 St and 21 St–Queensbridge. Roosevelt Island SHALL be one section covering the whole island. The rules of the map SHALL be the same as at every campus: one section in view at a time, a person can open the section they stand in and the ones next to it, and the view cannot leave the section.

#### Scenario: Standing on campus
- **WHEN** a person at Cornell Tech opens "Near you" while standing on the Cornell Tech campus
- **THEN** the map opens on the Roosevelt Island section

#### Scenario: The whole island
- **WHEN** a person standing at the lighthouse at the island's north end opens "Near you"
- **THEN** they are in the same Roosevelt Island section as someone on the Cornell Tech campus, and the whole island can be brought into view

#### Scenario: Next door only
- **WHEN** that person pushes the edge of the map toward Manhattan
- **THEN** the way on leads to Lexington Av/63 St

### Requirement: A place off the map is shown on its own
An event at a known place that lies in none of the campus's sections SHALL stay in the week's list, marked as off the map. When a person picks it in the list beside the map, the map SHALL show that place alone: a round sheet about a block and a half across around the place, named for the place, with the event's stamp and ticket on it, and nothing of the town between it and the campus. Where a known subway stop is a short walk from the place, the sheet SHALL carry that stop's name and line bullets as a sign that is not a button. One control SHALL lead back to the section the person stands in, and picking an event on the campus SHALL do the same. The map SHALL NOT open on a place off the map by itself, the day pills and the dial SHALL NOT lead to one, and pushing the edge of such a sheet SHALL NOT offer a way on. The Cornell Club and the ILR School's building at 570 Lexington Avenue SHALL be known places of the New York campus, shown this way.

#### Scenario: An event at the Cornell Club
- **WHEN** a person on the New York campus picks an event listed at the Cornell Club
- **THEN** the map shows the Cornell Club alone, names it, and shows a sign for Grand Central–42 St with its lines

#### Scenario: Back
- **WHEN** that person presses "Back to Roosevelt Island"
- **THEN** the map shows Roosevelt Island again with the first plan there picked

#### Scenario: The map does not start there
- **WHEN** the first event of the week is at the ILR building
- **THEN** the map opens on the campus, and that event's card says it is off the map

#### Scenario: No stop known nearby
- **WHEN** a person picks an event at a known place with no known stop near it
- **THEN** the map shows that place alone with no stop sign

### Requirement: The way on is a station sign
Where the section a way leads to has a stop, the way on at the edge of the map SHALL be drawn as a station sign: a dark plate with a white rule, the bullets of the lines that stop there in their colours, the stop's name, and how many events are on there. Pressing it SHALL open that section. A section with no stop SHALL show the way on as it does today.

#### Scenario: By train
- **WHEN** a person viewing Roosevelt Island pushes toward Lexington Av/63 St and something is on there
- **THEN** a sign shows that stop's line bullets, "Lexington Av/63 St" and the count of events, and pressing it opens that section

#### Scenario: Ithaca is unchanged
- **WHEN** a person in Ithaca pushes the edge of the map
- **THEN** the way on looks and reads as it did before this change

### Requirement: A shut way is a greyed sign
A way that cannot be taken (nothing on there, not open from where the person stands, or nothing that way) SHALL be drawn as the same sign in grey, SHALL say why in the words the map uses today, and SHALL NOT be a button.

#### Scenario: Nothing on
- **WHEN** a person viewing Roosevelt Island pushes toward 21 St–Queensbridge and nothing is on there
- **THEN** a grey sign names the stop and says nothing is on yet, and pressing it does nothing
