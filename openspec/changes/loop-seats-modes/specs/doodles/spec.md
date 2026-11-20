## MODIFIED Requirements

### Requirement: A game can be out while still in the works
A game that is out and not finished SHALL say "In the works" on its ticket, and its own page SHALL say so too where the page has room beside the game. It SHALL be playable by everyone.

#### Scenario: Seats on the page
- **WHEN** anyone opens Doodles
- **THEN** the Seats ticket says "In the works" and has a "Play" link to the game

#### Scenario: Seats is opened
- **WHEN** someone opens Seats on a laptop
- **THEN** the page says it is in the works and has a way back to Doodles

### Requirement: Seats is played against the clock
Seats SHALL be a page of the app, with the app's bar above and foot below, and SHALL offer three modes in this order: Chart, Table and Who moved?. It SHALL open on Chart. Every mode SHALL run on one clock that starts when the round does, SHALL add 2 seconds for a mistake, and SHALL stop at 60 seconds with the round lost. The fastest time SHALL be kept in the browser for each mode. The old address of Seats SHALL lead to the page.

#### Scenario: Chart
- **WHEN** "Flip them over" is pressed on Chart
- **THEN** twelve tiles holding six animals twice turn face down and the clock runs; two tiles turned that match stay up, two that do not add 2 seconds and turn back, and the round ends when every pair is found

#### Scenario: Table
- **WHEN** "Kick them out" is pressed on Table
- **THEN** the eight animals leave their coloured chairs, the chairs turn round the table, an animal sits only in its own chair, another empty chair adds 2 seconds and sends it back, and the round ends when all are seated

#### Scenario: Who moved?
- **WHEN** "Lights out" is pressed on Who moved?
- **THEN** the seats are covered, some animals swap seats, and the player taps the ones that moved; a wrong tap adds 2 seconds; there are five rounds, with 2, 2, 2, 4 and 4 to find

#### Scenario: The look between rounds
- **WHEN** a round of Who moved? is finished and another follows
- **THEN** the new seats are shown for 10, 8, 6 and then 5 seconds, counted down, the clock waits, and the button ends the look at once

#### Scenario: A hint
- **WHEN** ten seconds of a round of Who moved? pass with nothing found
- **THEN** one of the animals that moved wiggles and is ringed, and again every few seconds until it is tapped

#### Scenario: Out of time
- **WHEN** the clock reaches 60 seconds in any mode
- **THEN** it stops at 60.0, the round is lost, and the button offers another

#### Scenario: A best
- **WHEN** a round is won faster than the best kept for that mode
- **THEN** that time is kept for the mode, and the Doodles ticket shows the fastest of the three with its mode

#### Scenario: The old address
- **WHEN** someone opens `/seats`
- **THEN** they arrive at the Seats page of the app

#### Scenario: Reduced motion
- **WHEN** the device asks for reduced motion
- **THEN** nothing is thrown, turned or wiggled, the chairs of Table stay still, and every mode can still be played

### Requirement: With Ink+ your own animal plays Seats
The animal a signed-in person wears SHALL be one of the animals in every mode, and a "You" pill SHALL show it. For a person with Ink+ the pill SHALL open their own animals to choose among, the one chosen SHALL play in every mode and be kept in the browser, and it SHALL carry a spark in Chart and Table. In Who moved? it SHALL carry no spark. For anyone else the pill SHALL open a card that says Ink+ gives this, with a link to the Ink page.

#### Scenario: Someone with Ink+ opens Seats
- **WHEN** a person with Ink+ opens Seats
- **THEN** one of their own animals is in the game with a spark, and the "You" pill shows it

#### Scenario: They choose another
- **WHEN** they press "You" and pick another of their animals
- **THEN** that animal takes the place in every mode, each mode starts a new round, and it is the one next time

#### Scenario: Their animal is already in the crowd
- **WHEN** the animal they chose is one the crowd already has
- **THEN** it is in the crowd once

#### Scenario: Who moved?
- **WHEN** a person with Ink+ plays Who moved?
- **THEN** their animal has no spark, so nothing shows whether it moved

#### Scenario: Someone without Ink+
- **WHEN** a person without Ink+, or signed out, presses "You"
- **THEN** a card reads "Play as your own animal, in every mode." with a "See Ink+" link to the Ink page

### Requirement: Seats answers what the player does
Seats SHALL show each thing that happens: the start of a round, a mistake and what it cost, how many are left to find in Who moved?, and the end of a round with its time, saying so when it is the best yet. For a person with Ink+ the back of each Chart tile SHALL carry the app's ink blot, made from where the tile sits and never from the animal under it, and the app's blot SHALL spill over the ticket when the lights go out. With reduced motion none of this SHALL move, and the same facts SHALL still be shown.

#### Scenario: A mistake
- **WHEN** two tiles that do not match are turned, an animal is dropped on a chair that is not its own, or an animal that did not move is tapped
- **THEN** "+2s" rises from where it happened

#### Scenario: How many are left
- **WHEN** the lights come back on in Who moved?
- **THEN** the game says how many moved, and the plate on the stub counts down how many are left to find

#### Scenario: A round is won
- **WHEN** the last pair is found, the last animal is seated, or the last one that moved is tapped
- **THEN** the clock stops, the game says so, and says "your best yet" when it is
