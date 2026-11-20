## ADDED Requirements

### Requirement: One page holds the games
The app SHALL have a page, Doodles, that shows each game that is out as a ticket: a picture of it, its name, one line about it, and a link that plays it. The page SHALL be open to someone who is signed out.

#### Scenario: A visitor opens the page
- **WHEN** someone signed out opens Doodles
- **THEN** they see a ticket for Conga with a "Play" link to the game

#### Scenario: The best is shown
- **WHEN** the browser has kept a best for a game
- **THEN** that game's ticket says "Your best" with the number

#### Scenario: No game played yet
- **WHEN** the browser has kept no best for a game
- **THEN** its ticket says nothing about a best

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
