## ADDED Requirements

### Requirement: The plan is called Ink
Every place a person reads about the paid plan SHALL call it "Ink" or "Loop Ink". The words "Premium" and "Loop Premium" SHALL NOT appear in anything a student reads.

#### Scenario: A locked animal
- **WHEN** a person without Ink tries to keep an animal that comes with the plan
- **THEN** they are told "That one comes with Loop Ink."

#### Scenario: The ask pane
- **WHEN** a person opens "Create your own" in the account card
- **THEN** the pane is headed "Loop Ink" and no text in it says "Premium"

### Requirement: One address for the Ink page
Every placement that leads to the Ink page SHALL use the same address, held in one place in the code. The Ink page SHALL have the same top bar as the campus screen, with the Ink tab shown as the current page. Until a real page exists, it SHALL show the approved mockup at `/demo/mockups-premium.html` under that bar.

#### Scenario: Any placement
- **WHEN** a person presses the Ink tab, the account row's button, or the "With Ink" chip
- **THEN** each one opens the same page

#### Scenario: The bar stays
- **WHEN** a person opens the Ink page from the campus screen
- **THEN** the top bar is the one they came from, with "Ink" as the current page in place of "This week"

### Requirement: A row in the account card
The account card SHALL hold one row for the plan: the Ink mark, "Loop Ink", one short line, and one button that opens the Ink page. For a person who has Ink the row SHALL say "You have Ink" and keep the button.

#### Scenario: Without Ink
- **WHEN** a signed-in person without Ink opens their account card
- **THEN** the card shows a row reading "Loop Ink" with a button that opens the Ink page

#### Scenario: With Ink
- **WHEN** a person who has Ink opens their account card
- **THEN** the row reads "You have Ink"

### Requirement: Ink animals wear the mark in the picker
In the animal picker, every animal that comes with the plan SHALL wear the Ink mark. The picker SHALL have one "With Ink" chip that opens the Ink page, and its filter SHALL be labelled "Ink". The ask pane SHALL list the perks the Ink page leads with and SHALL say plainly which of them are not available yet.

#### Scenario: Seeing which animals need the plan
- **WHEN** a person without Ink opens the picker
- **THEN** the animals that come with the plan are in the same grid as the others, each with the Ink mark

#### Scenario: Pressing a locked animal
- **WHEN** a person without Ink presses an animal that comes with the plan
- **THEN** the ask pane opens, as it does today

#### Scenario: Perks not yet available
- **WHEN** the ask pane lists a perk that cannot be used yet
- **THEN** the pane says so in plain words

### Requirement: The Ink mark on a face
Wherever a person's face is shown, the face of a person who has Ink SHALL wear the Ink mark, and the face's accessible name SHALL say that they have Ink. A person without Ink SHALL NOT wear it. Being the admin SHALL NOT by itself give the mark.

#### Scenario: On a ticket
- **WHEN** a plan's ticket shows the faces of four people going, one of whom has Ink
- **THEN** exactly that one face wears the mark

#### Scenario: Your own face
- **WHEN** a person who has Ink looks at their avatar in the bar
- **THEN** it wears the mark beside the level badge

#### Scenario: The admin
- **WHEN** the admin, who has not asked for Ink, is shown on a ticket
- **THEN** their face does not wear the mark
