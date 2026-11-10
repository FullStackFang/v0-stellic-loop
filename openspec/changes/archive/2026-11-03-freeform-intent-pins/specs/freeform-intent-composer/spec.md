## ADDED Requirements

### Requirement: Freeform composition with explicit interpretation
The composer SHALL accept an activity and @ pins in one native text input, show its interpreted activity and pins before submission, and allow each interpreted value to be edited or removed. Only an activity of 1–80 characters SHALL be required. Unspecified day, time and place SHALL remain open.

#### Scenario: Freeform dinner
- **WHEN** a person types `Dinner Thursdays @after 7 @ramen @Hoi An`
- **THEN** Dinner is the activity, the next Thursday in the space window is shown as an exact date, and after 7, ramen and Hoi An are editable preference pins
- **AND** no recurring commitment or exact time/place is silently inferred

#### Scenario: Custom pins
- **WHEN** a person writes `Coffee @quiet place @bring a book`
- **THEN** both multiword preferences survive editing, submission and display verbatim except surrounding/repeated whitespace

#### Scenario: Manual correction
- **WHEN** a person changes the time pin or removes a preference
- **THEN** the text and interpreted result agree and the submitted values reflect the correction

### Requirement: Conservative parsing and limits
The composer SHALL recognize explicit day/time/place tags and once/weekly/every-other-week rhythms. Unknown @ text SHALL remain a custom preference. It SHALL preserve email-like text and unfamiliar activity names. Invalid explicit dates, conflicting singleton tags, oversized input, overlong pins, and more than 12 preferences SHALL show actionable errors and block submission. Duplicate preferences SHALL collapse case-insensitively.

#### Scenario: Invalid date
- **WHEN** `@day:2099-99-99` or an out-of-window day is entered
- **THEN** the composer shows a day error and creates no proposal

#### Scenario: Unsupported language
- **WHEN** the activity says `Suits in Hoi An` without @ pins
- **THEN** the entire activity remains intact and no location is invented

### Requirement: Compact accessible Quorum presentation
The composer SHALL use Archivo, paper, ink, yellow and hard shadows from the approved design. Controls SHALL be keyboard-operable, labeled and visibly focused. The baseline form SHALL fit at 320×667 and 390×844, while expanded editors, many pins and identity steps may scroll naturally.

#### Scenario: Small screen
- **WHEN** the baseline composer is viewed at 320×667
- **THEN** the primary action is visible without horizontal scrolling or overlap

#### Scenario: Keyboard editing
- **WHEN** a keyboard user activates a pin
- **THEN** focus moves to its labeled editor and returns to the composer when the edit is applied or canceled
