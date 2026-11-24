## ADDED Requirements

### Requirement: The same questions for every venue
The report SHALL be built from one written set of ten group-outing questions, with the area and the campus filled in, each asked once of each assistant. The questions asked SHALL be kept with the result.

#### Scenario: Two venues in one area
- **WHEN** reports are made for two venues on Roosevelt Island
- **THEN** both were asked the same ten questions

#### Scenario: The record of a run
- **WHEN** a run finishes
- **THEN** its saved result holds every question and every full answer

### Requirement: Nothing is asked without a yes
Run without its go-ahead flag, the script SHALL print the venue, the assistants, how many calls it would make and a rough cost, and SHALL stop without calling any assistant.

#### Scenario: No go-ahead
- **WHEN** the founder runs the script for a venue without the flag
- **THEN** it prints the count and the rough cost, and no assistant is called

#### Scenario: With the go-ahead
- **WHEN** the founder runs it again with the flag
- **THEN** the questions are asked

### Requirement: Counting when the venue is named
An answer SHALL count for the venue when it recommends a place whose name matches the venue's name or one of the other names given for it, ignoring case, punctuation and a leading "the". Every other place recommended SHALL be counted as named instead.

#### Scenario: Named by another spelling
- **WHEN** the venue is "Nisi Bistro", "Nisi" was given as another name, and an answer recommends "Nisi"
- **THEN** the answer counts for the venue

#### Scenario: Not named
- **WHEN** an answer recommends three other places
- **THEN** it does not count for the venue, and each of the three gains one under named instead

#### Scenario: Named twice in one answer
- **WHEN** an answer mentions the venue twice
- **THEN** it counts once

### Requirement: The sheet
The report SHALL be one self-contained page showing: the venue and the month; the number of answers that named the venue out of the number asked; that number by assistant; the three places named most instead; three of the questions; and Loopd's offer. It SHALL state the count as "N of M" and SHALL NOT state a percentage.

#### Scenario: Four of thirty
- **WHEN** 4 of 30 answers named the venue
- **THEN** the sheet's headline number reads 4 of 30, and the by-assistant counts add up to 4

#### Scenario: Opened with no connection
- **WHEN** the sheet is opened on a machine with no internet
- **THEN** it shows in full

### Requirement: The sheet says how it was measured
The sheet SHALL state the date of the run, each assistant by name, whether web search was on, and that answers vary from one asking to the next.

#### Scenario: Without search
- **WHEN** the run was made without web search
- **THEN** the sheet says so in plain words

### Requirement: Loopd's numbers only when given
The offer on the sheet SHALL show the venue's Loopd record numbers only when they were given to the script. Without them it SHALL make no claim about groups at the venue.

#### Scenario: Numbers given
- **WHEN** the script is given 41, 33 and 12
- **THEN** the offer says 33 student groups showed up

#### Scenario: No numbers
- **WHEN** no numbers are given
- **THEN** the offer says what Loopd would measure and states no number

### Requirement: Output stays out of the repo
The script SHALL write its result and its sheet to a folder outside the repository, and SHALL refuse a folder inside it.

#### Scenario: A folder inside the repo
- **WHEN** the founder gives an output folder inside the repository
- **THEN** the script refuses and says why

### Requirement: A stale assistant name fails clearly
When an assistant on the list is no longer offered, the script SHALL stop before asking anything and SHALL name it.

#### Scenario: A retired model
- **WHEN** one of the three names is not in the gateway's list
- **THEN** the script stops, names it, and calls no assistant
