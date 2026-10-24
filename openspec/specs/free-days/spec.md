# free-days Specification

## Purpose
TBD - created by archiving change quorum-board. Update Purpose after archive.
## Requirements
### Requirement: Free days per person per board window
Each person SHALL be able to mark any day of a board's current window, today or later, as free on their own page and change it at any time. On a rolling board the page SHALL show the 14 window days in two rows of seven. Changing a free day SHALL update the person's days on every open, needs-a-day proposal they are `in` on, and SHALL NOT touch ON proposals. Days before today SHALL not be markable and SHALL not count.

#### Scenario: Mark a day free
- **WHEN** Priya marks Sun 14 free while in on "Suits" and "Boat"
- **THEN** both proposals' heat for Sun 14 increase by one

#### Scenario: ON proposal untouched
- **WHEN** Priya unmarks Thu 18 while in on an ON proposal locked to Thu 18
- **THEN** that proposal's count and locked day are unchanged

#### Scenario: Two weeks on a rolling board
- **WHEN** Priya opens her page on a rolling board on Tue Nov 3 2026
- **THEN** she sees Nov 3 to Nov 16 in two rows of seven and can mark any of them free

#### Scenario: Next week's Thursday
- **WHEN** Priya marked Thu Nov 5 free last week and today is Tue Nov 10
- **THEN** Thu Nov 5 is outside the window and Thu Nov 12 is not free until she marks it

### Requirement: Tapping in attaches your days
When a person answers `in` on a needs-a-day proposal, the system SHALL copy their current free days for the board, minus conflict days, to that answer. The person SHALL be able to adjust the days on that proposal alone afterwards.

#### Scenario: Attach on tap-in
- **WHEN** Priya, free Mon, Tue, Thu, Fri, taps in on "Boat"
- **THEN** her "Boat" answer carries Mon, Tue, Thu, Fri

#### Scenario: Per-proposal adjustment
- **WHEN** Priya removes Mon from her "Boat" days
- **THEN** her free days still include Mon and only "Boat" heat for Mon drops

### Requirement: Conflict days are removed and explained
A day on which the person is `in` on an ON proposal with that locked day SHALL be removed from their days on other proposals and SHALL NOT count toward their heat there. The card SHALL say which ON proposal took the day.

#### Scenario: Already on elsewhere
- **WHEN** Priya is in on "Suits", locked to Tue 16, and taps in on "Boat"
- **THEN** her "Boat" days exclude Tue 16 and the card reads "You're already on for Suits in Hoi An Tue 16; that day won't count for you here"

### Requirement: Day heat shows counts, never who
For every needs-a-day proposal, the system SHALL compute per window day the number of `in` people whose days include it, and SHALL expose only those counts.

#### Scenario: Heat row
- **WHEN** three people are in with days {Tue}, {Tue, Wed}, {Wed}
- **THEN** heat reads Tue 2, Wed 2 and no other day, with no names

### Requirement: Proposals that need no day ignore days
When "needs a day" is off, answers SHALL carry no days, no heat SHALL be shown, and the page SHALL show the poster's note about days if any.

#### Scenario: Shirt order
- **WHEN** a person taps in on "Cohort shirts"
- **THEN** no days are attached and the card shows "No day needed"

