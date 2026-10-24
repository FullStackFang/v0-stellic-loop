# Spec Delta

## Purpose

Free days work on a rolling two-week window as they do on the trip week.

## MODIFIED Requirements

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
