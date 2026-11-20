## ADDED Requirements

### Requirement: The footer can be drawn with seats
The footer SHALL have a setting that draws its ticket with a row of seats. With the setting left out, the footer SHALL be drawn and SHALL move exactly as it does without this change.

#### Scenario: The setting is left out
- **WHEN** a page draws the footer without the setting
- **THEN** the ticket has no seats, and the animals stand in it as they do today

#### Scenario: The setting is on
- **WHEN** a page draws the footer with the setting on
- **THEN** the ticket shows one seat for each animal in it, and the bar under the ticket is unchanged

### Requirement: The animals leave their seats
With seats, the animals SHALL start in their seats and SHALL leave them for the floor of the ticket, one after another, the first time the ticket comes into view.

#### Scenario: The ticket comes into view
- **WHEN** the ticket is scrolled into view for the first time
- **THEN** each animal drops from its seat to the floor, a moment after the one before it

#### Scenario: Reduced motion
- **WHEN** the person's device asks for reduced motion
- **THEN** the animals are on the floor from the start and nothing falls

### Requirement: An animal can be seated again
A person SHALL be able to pick an animal up and drop it on an empty seat, where it stays. A seat SHALL hold one animal. Picking a seated animal up SHALL free its seat.

#### Scenario: Dropped on an empty seat
- **WHEN** an animal is let go within reach of an empty seat
- **THEN** it sits in that seat and stops moving

#### Scenario: Dropped away from any seat
- **WHEN** an animal is let go away from every empty seat
- **THEN** it flies and falls as it does in the footer today

#### Scenario: Dropped on a taken seat
- **WHEN** an animal is let go on a seat that already holds one
- **THEN** it does not sit there, and falls to the floor

#### Scenario: The seat it is over is shown
- **WHEN** a held animal is within reach of an empty seat
- **THEN** that seat is ringed in the action colour

### Requirement: The ticket says when all are in
When every seat holds an animal, the ticket SHALL say "All in". When one is taken out again, it SHALL say what it said before.

#### Scenario: The last one is seated
- **WHEN** the last empty seat is filled
- **THEN** the pill on the ticket reads "All in"

#### Scenario: One is taken out
- **WHEN** a seated animal is picked up after all were in
- **THEN** the pill reads "Pick one up" again

### Requirement: A seated animal stays seated
Tipping or pulling the ticket SHALL move only the animals on the floor.

#### Scenario: The ticket is tipped
- **WHEN** the ticket is picked up and tipped with some animals seated
- **THEN** the seated ones stay in their seats and the ones on the floor slide

### Requirement: Nothing of it is needed to use the site
The ticket and everything in it SHALL be hidden from screen readers, as today, and SHALL hold no link or control that leads anywhere.

#### Scenario: Read by a screen reader
- **WHEN** a screen reader reads the footer
- **THEN** it reads the bar's links and the colours, and nothing of the ticket
