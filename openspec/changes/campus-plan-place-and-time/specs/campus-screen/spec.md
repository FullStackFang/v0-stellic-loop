## ADDED Requirements

### Requirement: Picking where to meet
On a campus where places are required, the posting panel SHALL show, under the line, a where line ("Where do you meet?" until a place is set, then "Meet at <place>") and the campus's places as pills under kind tabs: Near you, Food, Parks, Sports, Buildings. Near you SHALL hold the eight places nearest the person when the browser gives a location, and otherwise the eight most used in plans. The box of pills SHALL keep one height and SHALL NOT scroll. Pressing a pill SHALL put that place's @name in the line, replacing a place @ already there. Typing "@" and letters SHALL narrow the pills to the places that match, from every kind. Post SHALL stay disabled until the line has a place.

#### Scenario: Pick from the pills
- **WHEN** a person typed "Jogging around roosevelt island" and presses "Southpoint Park" under Parks
- **THEN** the line ends in "@southpoint", the where line says "Meet at Southpoint Park", and Post can be pressed

#### Scenario: Change the place
- **WHEN** the line has "@southpoint" and the person presses "Lighthouse Park"
- **THEN** the line has "@lighthouse" instead and no "@southpoint"

#### Scenario: Typing part of a name
- **WHEN** the person types "@fi"
- **THEN** the pills are the places whose names match, such as Firefighters Field

#### Scenario: Not yet a place
- **WHEN** the line has no place
- **THEN** the where line asks "Where do you meet?" and Post cannot be pressed

### Requirement: Places on the map while posting
While the posting panel is open on a wide screen, the map beside it SHALL show every place of the section as a small dot, the dots of the open tab ringed, a dot's name shown when pointed at. Pressing a dot SHALL pick that place as a pill does. The picked place SHALL show the person's animal stamp standing on it. On a phone, the panel SHALL carry a strip of map showing the picked place; pressing the strip SHALL open the map with the dots, with a Done pill that returns to the panel.

#### Scenario: Tap a dot
- **WHEN** a person posting presses the dot of Lighthouse Park
- **THEN** Lighthouse Park is the plan's place and their animal stands on it

#### Scenario: Phone
- **WHEN** a person posting on a phone presses the map strip
- **THEN** the map opens with the places as dots and a Done pill

### Requirement: People's plans look like people's
On the map, the stamp of a plan a person posted SHALL carry that person's animal where a listed event's stamp carries a drawn picture. A plan whose time is not set SHALL have a white stamp with a red "?" and its day.

#### Scenario: Two kinds side by side
- **WHEN** the map shows a watercolor class from a calendar and a run a person posted
- **THEN** the class's stamp has the drawn picture and the run's stamp has the poster's animal

### Requirement: People in the source bar
The source bar over the list SHALL read "Best for you", "People", then the campus's calendar source, then the greyed names marked "soon". "People" SHALL show only plans people posted, in the list and on the map. On a phone the same part SHALL be in the tabs.

#### Scenario: Only people's plans
- **WHEN** a person presses "People"
- **THEN** the list and the map show only plans people posted, and no calendar events
