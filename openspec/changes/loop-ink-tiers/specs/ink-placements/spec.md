## MODIFIED Requirements

### Requirement: A row in the account card
The account card SHALL hold one row for the plan:
- the mark;
- the plan's name;
- one short line;
- at most one button.

What the row shows depends on the person's plan:
- **Without a plan:** "Loop Ink", with the Ink mark and a button that opens the Ink page.
- **With Ink:** "You have Ink", with the Ink mark, and under it a short line offering Ink+ at $9.99.
- **With Ink+:** "You have Ink+", with the Ink+ mark.

#### Scenario: Without Ink
- **WHEN** a signed-in person without Ink opens their account card
- **THEN** the card shows a row reading "Loop Ink" with a button that opens the Ink page

#### Scenario: With Ink
- **WHEN** a person who has Ink opens their account card
- **THEN** the row reads "You have Ink" and offers Ink+ at $9.99

#### Scenario: With Ink+
- **WHEN** a person who has Ink+ opens their account card
- **THEN** the row reads "You have Ink+" and wears the Ink+ mark

### Requirement: Ink animals wear the mark in the picker
In the animal picker, every animal that comes with the plan SHALL wear the Ink mark, the blot alone. The picker's filter SHALL be the Ink mark alone, named "Ink" to a screen reader. The picker SHALL have no link of its own to the Ink page: an Ink animal pressed by a person without Ink or Ink+ opens the ask pane. The ask pane SHALL list the perks the Ink page leads with, and SHALL say plainly which of them are not available yet.

#### Scenario: Seeing which animals need the plan
- **WHEN** a person without Ink opens the picker
- **THEN** the animals that come with the plan are in the same grid as the others, each with the Ink mark

#### Scenario: Pressing a locked animal
- **WHEN** a person without Ink or Ink+ presses an animal that comes with the plan
- **THEN** the ask pane opens, as it does today

#### Scenario: Perks not yet available
- **WHEN** the ask pane lists a perk that cannot be used yet
- **THEN** the pane says so in plain words

### Requirement: The Ink mark on a face
Wherever a person's face is shown, the face SHALL show their plan:
- **Ink:** the face sits on the Ink blot.
- **Ink+:** the face sits on the same blot, with the Ink+ sparks.
- **No plan:** the face wears neither.

The face's accessible name SHALL say which plan they have. Being the admin SHALL NOT by itself give either.

#### Scenario: On a ticket
- **WHEN** a plan's ticket shows the faces of four people going, one with Ink and one with Ink+
- **THEN** the face with Ink is on a blot, and the face with Ink+ is on a blot with sparks

#### Scenario: Your own face
- **WHEN** a person who has Ink looks at their avatar in the bar
- **THEN** it wears the blot beside the level badge

#### Scenario: The admin
- **WHEN** the admin, who has asked for neither plan, is shown on a ticket
- **THEN** their face wears neither the blot nor the sparks
