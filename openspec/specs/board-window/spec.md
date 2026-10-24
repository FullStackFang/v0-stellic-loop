# board-window Specification

## Purpose
TBD - created by archiving change quorum-boards. Update Purpose after archive.
## Requirements
### Requirement: A board's window is fixed or rolling
Every board SHALL have exactly one window kind. A *fixed* board SHALL have a start and an end date with at most 14 days from start to end inclusive (end minus start between 0 and 13), and its window SHALL be those dates. A *rolling* board SHALL have no stored dates, and its window SHALL be today and the following 13 days in the board's timezone, recomputed on every read. Every place that shows or uses a board's dates (header, hero label, date blocks, strips, heat, lock) SHALL get them from the window, never from stored dates directly.

#### Scenario: Fixed trip week
- **WHEN** a person opens `emba27` (fixed, Feb 14 to Feb 20 2027) on 2026-11-03
- **THEN** the window is the seven days Feb 14 to Feb 20 2027

#### Scenario: Longest fixed window
- **WHEN** the founder inserts a fixed board for Mar 1 to Mar 14, and another for Mar 1 to Mar 15
- **THEN** the first is accepted and the second is rejected by the database

#### Scenario: Rolling two weeks
- **WHEN** a person opens a rolling board in America/New_York at 23:30 local time on Tue Nov 3 2026
- **THEN** the window is Nov 3 to Nov 16 2026

#### Scenario: Window moves at local midnight
- **WHEN** the same person reloads the rolling board at 00:10 local time on Wed Nov 4 2026
- **THEN** the window is Nov 4 to Nov 17 2026

#### Scenario: Across the clock change
- **WHEN** a person opens a rolling board in America/New_York on Sun Oct 25 2026
- **THEN** the window is the 14 calendar days Oct 25 to Nov 7 2026, with Nov 1 (the day clocks go back) appearing once

#### Scenario: Rolling board pages render
- **WHEN** a person opens a rolling board, one of its proposals, and its You page
- **THEN** every page renders, the header reads "<board name> · Next two weeks", and nothing reads stored window dates

### Requirement: Past days never count
A window day before today in the board's timezone SHALL NOT count toward heat, SHALL NOT be a best day, and SHALL NOT be lockable, on fixed and rolling boards alike. Free days and attached days in the past SHALL be kept as data but ignored: days attached on tap-in, days listed next to a person's name, and days listed on the You page SHALL be counted days only.

#### Scenario: Mid-trip
- **WHEN** it is Wed Feb 17 2027 on the trip board and "Boat" has heat Mon 6, Thu 4 with a minimum of 4
- **THEN** the best day is Thu 18, and in the strips Mon 15 is shown with the struck-through day look, no count, no label under it, and does nothing when tapped

#### Scenario: Yesterday on a rolling board
- **WHEN** Priya marked Mon Nov 2 free and today is Tue Nov 3
- **THEN** Mon Nov 2 is not in the window, adds nothing to any heat, is not attached when she taps in, and is not listed next to her name

#### Scenario: Past day on a card
- **WHEN** a fixed board's card is shown mid-window
- **THEN** a past day's heat cell is blank, the same as a day nobody is free

### Requirement: The window is shown in rows of seven
Every strip of days (your free days, your days on a proposal, the heat on the proposal page) SHALL show the whole window, seven days per row, so a 14-day window is two rows and a 7-day window is one; the strip's section label SHALL carry the window's dates so a row crossing a month is readable. The heat on a board card SHALL show one row of seven using the card heat exactly as v5 draws it: the first seven window days, or the second seven when the best or locked day falls there, with the date block alone telling which week is shown.

#### Scenario: Card on a rolling board
- **WHEN** a rolling board's card has its best day 10 days from today
- **THEN** the card's heat row shows window days 8 to 14 with the best day highlighted and weekday letters only, and the date block shows the best day's date

#### Scenario: Proposal page on a rolling board
- **WHEN** a person opens a needs-a-day proposal on a rolling board on Mon Nov 23 2026
- **THEN** the heat shows 14 days in two rows of seven and the section label reads "Nov 23 – Dec 6"

### Requirement: Fixed windows keep their dates
A fixed board's window SHALL never move, and a fixed board SHALL behave as it did before this change except that past days no longer count. A needs-a-day proposal SHALL NOT be posted on a fixed board whose window is over; the form SHALL say "This board's dates are over."

#### Scenario: Trip board unchanged
- **WHEN** the migration runs on the live database
- **THEN** `emba27` is fixed with Feb 14 to Feb 20 2027 and its proposals, answers and events are unchanged

#### Scenario: Posting after the trip
- **WHEN** a person posts a needs-a-day intent on `emba27` on Mar 1 2027
- **THEN** the post is refused with "This board's dates are over." and nothing is created

