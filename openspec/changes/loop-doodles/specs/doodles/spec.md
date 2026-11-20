## ADDED Requirements

### Requirement: One page holds the games
The app SHALL have a page, Doodles, that shows each game that is out as a ticket: a picture of it, its name, one line about it, and a link that plays it. The page SHALL be open to someone who is signed out.

#### Scenario: A visitor opens the page
- **WHEN** someone signed out opens Doodles
- **THEN** they see a ticket for each game that is out, Conga first, each with a "Play" link to the game

#### Scenario: The best is shown
- **WHEN** the browser has kept a best for a game
- **THEN** that game's ticket says "Your best" with the number

#### Scenario: No game played yet
- **WHEN** the browser has kept no best for a game
- **THEN** its ticket says nothing about a best

### Requirement: A game can be out while still in the works
A game that is out and not finished SHALL say "In the works" on its ticket, and its own page SHALL say so too. It SHALL be playable by everyone.

#### Scenario: Seats on the page
- **WHEN** anyone opens Doodles
- **THEN** the Seats ticket says "In the works" and has a "Play" link to the game

#### Scenario: Seats is opened
- **WHEN** someone opens Seats
- **THEN** the page says it is in the works and has a way back to Doodles

### Requirement: Seats is played against the clock
A round of Seats SHALL give each animal a seat of its own and show it there. On "Kick them out" every animal SHALL leave its seat for the floor and a clock SHALL start. An animal SHALL sit only in its own seat. Dropping one on another empty seat SHALL add 2 seconds and send it back to the floor. The clock SHALL stop when every animal is in its own seat, and the fastest time SHALL be kept in the browser.

#### Scenario: A round starts
- **WHEN** Seats opens, or "Again" or "Start over" is pressed
- **THEN** the animals are seated in a new order, no clock runs, and the button reads "Kick them out"

#### Scenario: They are kicked out
- **WHEN** "Kick them out" is pressed
- **THEN** every seat is empty, the animals are on the floor in no order, and the clock runs

#### Scenario: Its own seat
- **WHEN** an animal is dropped on its own seat
- **THEN** it sits there and cannot be picked up again in that round

#### Scenario: Another seat
- **WHEN** an animal is dropped on an empty seat that is not its own
- **THEN** it falls back to the floor, the seat shakes, and 2 seconds are added

#### Scenario: All in
- **WHEN** the last animal is seated
- **THEN** the clock stops, the ticket says "All in" with the time, and a time faster than the best kept replaces it

#### Scenario: Reduced motion
- **WHEN** the device asks for reduced motion and "Kick them out" is pressed
- **THEN** the animals are on the floor at once, with nothing thrown

### Requirement: A staged game is the admin's alone
A game that is not out SHALL be shown only to the admin, after the games that are out, marked as staged, with a "Try" link in place of "Play". Nothing about it SHALL be sent to anyone else.

#### Scenario: The admin opens the page
- **WHEN** the admin opens Doodles
- **THEN** they see the staged games after the rest, each marked "Staged: only you see this", with "Try"

#### Scenario: Anyone else opens the page
- **WHEN** a person who is not the admin opens Doodles
- **THEN** no staged game is on the page

### Requirement: The bar leads to the page
The top bar SHALL have one link, "Doodles", to the page, in place of a link to a game, and SHALL mark it as the page when the page is open.

#### Scenario: The link in the bar
- **WHEN** any page with the top bar is open
- **THEN** the bar has "Doodles" between "This week" and "Ink", and no "Conga"

#### Scenario: On the page
- **WHEN** Doodles is open
- **THEN** "Doodles" in the bar is marked as the current page
