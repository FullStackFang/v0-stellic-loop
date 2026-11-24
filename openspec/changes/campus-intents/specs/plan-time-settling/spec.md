## MODIFIED Requirements

### Requirement: A plan posted with a day and no time
No new plan SHALL be posted with a day and no time; a proposal always has a time (see campus-intents). A plan already posted with its time not set SHALL keep being listed on its day, first in that day, with its time shown as "?", and its stamp on that day's map SHALL be white with a red "?" and the day, until its time is set or its day ends.

#### Scenario: Run tomorrow, no time
- **WHEN** a person tries to post "run @southpoint tomorrow" with no time
- **THEN** no plan is posted with its time open; the intent is posted and Propose asks for a time

#### Scenario: An older plan with no time
- **WHEN** a plan posted for Tuesday with no time before this change is on the list
- **THEN** it shows "Tue ?" and its white stamp with a red "?" as before
