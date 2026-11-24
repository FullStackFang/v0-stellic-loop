## MODIFIED Requirements

### Requirement: People's plans look like people's
On the map, the stamp of a plan a person posted SHALL show its time and its going count, and SHALL NOT carry the poster's animal or any face. A listed event's stamp SHALL keep its drawn picture. A plan posted before this change whose time is not set SHALL have a white stamp with a red "?" and its day.

#### Scenario: Two kinds side by side
- **WHEN** the map shows a watercolor class from a calendar and a run proposed on an intent
- **THEN** the class's stamp has the drawn picture and the run's stamp shows its time and going count, with no face

## ADDED Requirements

### Requirement: Intents on the campus page
The campus page SHALL list open intents as their own rows: title, tags, the count in, faces as far as the viewer may see them, and "I'm in" (or "Propose a time and place" once in). Opening an intent SHALL show its proposals, each with its date tile, place, going faces and count, "on at 2" or "It's on", and Going / Can't. The posting "+" SHALL open "What do you want to do?".

#### Scenario: An intent with two proposals
- **WHEN** a person in "Run the island" opens it while it has a proposal for Thursday and a matched Saturday 5K
- **THEN** both show, the 5K marked with its source, each with Going and Can't

### Requirement: The ask card on top
The campus page SHALL show, above the list, a card for each proposal ahead on an intent the viewer is in that they have not answered: the intent, the day, time and place, and Going / Can't. Answering SHALL remove the card.

#### Scenario: Two asks waiting
- **WHEN** a person has two unanswered proposals ahead
- **THEN** two ask cards show above the list until they answer each
