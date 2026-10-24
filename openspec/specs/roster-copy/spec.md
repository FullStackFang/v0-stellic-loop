# roster-copy Specification

## Purpose
TBD - created by archiving change quorum-boards. Update Purpose after archive.
## Requirements
### Requirement: Copy the names of who's in
The proposal page SHALL show "Copy names" as a ghost button in its existing actions row, beside "Share" and "Post a version", whenever at least one person is in; the row SHALL fit at 390px. Copying SHALL put on the clipboard one line for the title and count, and one line of names: the in names first, then "Maybe:" and the maybe names when there are any. The viewer's own row SHALL be copied under their name, not "You". People whose name switch is off SHALL be counted as "and N more" and SHALL NOT be named. Phone numbers SHALL never be copied. A toast SHALL read "Copied the list · N in".

#### Scenario: Interest list
- **WHEN** "Ski trip" has Priya, Marcus and Dana in with names shown, two people in with names hidden, and Hana maybe, and a person taps "Copy names"
- **THEN** the clipboard holds "Ski trip · 5 in" and "Priya, Marcus, Dana and 2 more · Maybe: Hana", and the toast reads "Copied the list · 5 in"

#### Scenario: Nobody in
- **WHEN** a proposal has no one in
- **THEN** no "Copy names" action is shown

### Requirement: Anyone with the link can copy
Copying SHALL be available to anyone who can open the proposal page, signed in or not, because the names are already visible to them. Copying SHALL write no event and change no state.

#### Scenario: Signed out
- **WHEN** a visitor with no cookie taps "Copy names"
- **THEN** the names are copied and nothing is written to the database

