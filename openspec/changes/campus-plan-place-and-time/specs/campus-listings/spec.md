## MODIFIED Requirements

### Requirement: Places and the map
The system SHALL keep a list of named places per campus with coordinates, and SHALL match an event's place text to that list by name or by another name the place goes by. Each place SHALL have a kind (food, park, sport or building; a place with none counts as a building) and a short @name: its first other name, or else its name, written as a tag. A person's plan SHALL take as its place the first of its @tags that is a place's @name, with that place's name as its place text. An opened event whose place is matched SHALL show a map centred on that place with the place name under it. An event whose place is not matched SHALL show its place text and no map.

#### Scenario: Matched place
- **WHEN** a person opens an event whose place text is "Arts Quad" and the campus has a place of that name
- **THEN** the panel shows a map centred on the Arts Quad

#### Scenario: Unmatched place
- **WHEN** a person opens an event whose place text matches no place on the list
- **THEN** the panel shows the place text and no map

#### Scenario: A plan's @ is a place
- **WHEN** a person posts "run @southpoint tomorrow" and the campus has "Southpoint Park" going by "southpoint"
- **THEN** the plan's place is Southpoint Park and it stands there on the map

## ADDED Requirements

### Requirement: Public places loaded for a campus
A campus where places are required SHALL have its public places loaded: every named place OpenStreetMap has inside the campus's map sections that people can meet at (food and drink, parks, fields and courts, public buildings, stations), and none that are homes, dormitories, schools, plant rooms or garages. Loading SHALL add places and SHALL NOT remove or rename places already on the list. Cornell Tech SHALL have the places of the Roosevelt Island section.

#### Scenario: Loaded once
- **WHEN** the founder runs the places SQL for Cornell Tech
- **THEN** Cornell Tech has the island's public places, each with a kind and an @name, and the venues it already had are still there

#### Scenario: No homes
- **WHEN** a person looks through the places offered on Cornell Tech
- **THEN** no apartment building or dormitory is among them

### Requirement: Places required per campus
Only campuses named in the system as requiring places SHALL refuse a plan without a place. Cornell Tech SHALL be the first; any other campus SHALL post plans as before until it is named.

#### Scenario: Cornell Tech
- **WHEN** a person posts a plan with no place on Cornell Tech
- **THEN** the system refuses

#### Scenario: Ithaca unchanged
- **WHEN** a person posts a plan with no place on Cornell
- **THEN** it is posted
