# venue-record Specification

## Purpose
A place's record of student groups: how many said they were coming, showed up and came back, counted and never who, opened by a private link or made public by the admin. Created by archiving change campus-venue-record.
## Requirements
### Requirement: Three numbers for a place
The record page for a place SHALL show, for the chosen span, the number of groups that said they were coming, the number that showed up, and the number that came back. A group is one outing on an event at that place. A group said it was coming when it has two or more members. A group showed up when two or more of its members checked in. A group came back when it showed up and at least two of its checked-in members had checked in together at the same place on an earlier day.

#### Scenario: A group that only said it was coming
- **WHEN** an outing at the place has three members and none checked in
- **THEN** it adds one to "said they were coming" and nothing to the other two numbers

#### Scenario: A group that showed up
- **WHEN** two members of an outing at the place check in
- **THEN** it adds one to "showed up"

#### Scenario: One person alone
- **WHEN** an outing at the place has one member, or only one member checked in
- **THEN** it is not counted as a group that showed up

#### Scenario: Coming back
- **WHEN** Ana and Dev checked in together at the place last week and check in together there again today in a group of four
- **THEN** today's group adds one to "came back"

#### Scenario: A different place
- **WHEN** an outing is on an event at another place, or on an event with no matched place
- **THEN** it is not in this record

### Requirement: The span
The page SHALL offer the last 4 weeks, the last 8 weeks and all time, SHALL open on 8 weeks, and SHALL count an outing by the start of its event in the campus timezone.

#### Scenario: Switching the span
- **WHEN** a visitor presses "4 weeks"
- **THEN** all numbers and panels are recounted for the last 4 weeks and that pill is the filled one

### Requirement: Breakdowns only with enough groups
When five or more groups showed up in the span, the page SHALL also show the groups that showed up by week, by size (2 people, 3 or 4, 5 or more) and by day (Monday to Thursday, Friday, weekend). With fewer than five, the page SHALL show the three numbers and no breakdown.

#### Scenario: Thirty-three groups
- **WHEN** 33 groups showed up in the span
- **THEN** the three panels are shown and each adds up to 33

#### Scenario: Two groups
- **WHEN** 2 groups showed up in the span
- **THEN** only the three numbers and the note are shown

### Requirement: Counts and never people
The record page, its address, its page source and any data it loads SHALL NOT contain a person's name, first name, face, photo, school email, id, or the time of one person's check-in.

#### Scenario: Reading the page source
- **WHEN** the page for a place with outings is fetched
- **THEN** the response holds no name and no person id of anyone in those outings

### Requirement: How a group is counted is stated
The page SHALL carry one note saying that each person pressed Check in on their own phone, near the place, during the hours of the plan, and that Loopd never shows who they were.

#### Scenario: The note
- **WHEN** a visitor opens a record
- **THEN** the note is on the page, below the numbers

### Requirement: Opened by a private link unless made public
A record SHALL open only with its private link, or for anyone when the admin has made it public. A wrong or missing key on a private record SHALL respond with not found. The admin SHALL be able to copy a place's record link, make a new link that stops the old one, and switch the record between private and public. A private record SHALL be marked so that search engines do not list it.

#### Scenario: Private link
- **WHEN** a visitor opens the address with the place's key
- **THEN** the record is shown

#### Scenario: No key
- **WHEN** a visitor opens a private record's address with no key or a wrong one
- **THEN** the system responds with not found

#### Scenario: New link
- **WHEN** the admin makes a new link for a place
- **THEN** the old link responds with not found and the new one opens the record

#### Scenario: Made public
- **WHEN** the admin switches a place's record to public
- **THEN** the address opens with no key

#### Scenario: Not the admin
- **WHEN** a signed-in person who is not the admin tries to copy, renew or switch a record
- **THEN** the system refuses

### Requirement: Works before the migration
Before the record columns exist in the database, the admin Places tab SHALL say which migration to run, and every record address SHALL respond with not found.

#### Scenario: Columns missing
- **WHEN** the migration has not been run and the admin opens the Places tab
- **THEN** it names the migration file to run and shows no record controls
