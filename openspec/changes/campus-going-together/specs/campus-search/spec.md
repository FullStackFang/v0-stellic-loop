## MODIFIED Requirements

### Requirement: Best for you with nothing typed
With nothing typed, the system SHALL show the five events with the most pull for the viewer as the best, in time order, and SHALL state how many of the week's events they are out of. The remaining events SHALL follow in the same row after a marker that states how many more there are this week. Pull SHALL rise when the viewer is in the event, when people they know are in it, when at least one of those people is someone the viewer has been out with two or more times, when it carries a reward, when it is one person short of unlocking, and when it is today.

#### Scenario: Fourteen events this week
- **WHEN** a person opens the screen in a week with fourteen events
- **THEN** five are shown first under "Your best 5 of 14 this week", then a marker reading "9 more this week", then the other nine

#### Scenario: Five or fewer events
- **WHEN** a week has four events
- **THEN** all four are shown and there is no marker

#### Scenario: A regular is going
- **WHEN** two events are alike in every way except that one has a person the viewer has been out with three times and the other has a person the viewer only shares a group with
- **THEN** the first has more pull
