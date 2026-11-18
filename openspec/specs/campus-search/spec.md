# campus-search Specification

## Purpose
TBD - created by archiving change loop-campus-rewards. Update Purpose after archive.
## Requirements
### Requirement: Good-for words on every event
The system SHALL give every event up to twelve plain "good for" words when it is created, worked out by a fixed table from the event's title, about text and host name. A word typed into search SHALL match an event when it begins a word in the event's title, host name or place, or begins one of its "good for" words.

#### Scenario: A run is good for exercise
- **WHEN** an event titled "Sunset run, easy 5K" is created
- **THEN** its "good for" words include exercise

#### Scenario: Meaning finds different activities
- **WHEN** a person types "exercise" and the week holds a run, a hike, a pickup basketball game and a resume drop-in
- **THEN** the run, the hike and the basketball game match and the resume drop-in does not

#### Scenario: Filler words
- **WHEN** a person types "something to eat with people"
- **THEN** only "eat" and "people" style words are used for matching, and filler words are ignored

### Requirement: Best for you with nothing typed
With nothing typed, the system SHALL show the five events with the most pull for the viewer as the best, in time order, and SHALL state how many of the week's events they are out of. The remaining events SHALL follow in the same row after a marker that states how many more there are this week. Pull SHALL rise when the viewer is in the event, when people they know are in it, when it carries a reward, when it is one person short of unlocking, and when it is today.

#### Scenario: Fourteen events this week
- **WHEN** a person opens the screen in a week with fourteen events
- **THEN** five are shown first under "Your best 5 of 14 this week", then a marker reading "9 more this week", then the other nine

#### Scenario: Five or fewer events
- **WHEN** a week has four events
- **THEN** all four are shown and there is no marker

### Requirement: A few best matches for what was typed
With something typed, the system SHALL rank matching events by how well they match and by pull, SHALL show at most four of the highest ranked as the best matches, and SHALL show any remaining matches after a marker that states how many looser matches there are. The results SHALL update as the person types, without leaving the screen.

#### Scenario: Best and looser matches
- **WHEN** a person types "exercise" and six events match, four of them strongly
- **THEN** four are shown under "4 best matches" and two follow after a marker reading "2 looser matches"

#### Scenario: Nothing matches
- **WHEN** a person types a word that matches no event
- **THEN** the row says nothing matches and suggests another word or posting a plan

#### Scenario: Words to try
- **WHEN** a person presses one of the suggested words beside the count
- **THEN** the search box is filled with it and the row shows its matches

### Requirement: The complete CampusGroups view
The system SHALL offer "All of CampusGroups" beside "Best for you". It SHALL show every CampusGroups event of the week in time order, or every one that matches what was typed, with no best group and no marker.

#### Scenario: Exhaustive list
- **WHEN** a person chooses "All of CampusGroups" with nothing typed in a week with ten CampusGroups events
- **THEN** all ten are shown in time order

#### Scenario: Exhaustive list with a word
- **WHEN** a person chooses "All of CampusGroups" and types "exercise"
- **THEN** every CampusGroups event that matches is shown, however weak the match

### Requirement: Silent ranking
The system SHALL NOT show a reason, a score or a label that explains why an event was ranked where it is.

#### Scenario: No reason shown
- **WHEN** an event is among a person's best because a friend is going
- **THEN** the ticket shows the friend's face among the seats as it would anywhere, and no text saying why the event was picked

