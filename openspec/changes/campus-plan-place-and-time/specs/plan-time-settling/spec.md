## ADDED Requirements

### Requirement: A plan posted with a day and no time
A person's plan whose line names a day (or no day, meaning today) and no hour SHALL be posted with its time not set. Until a time is set, the plan SHALL be listed on its day, first in that day, with its time shown as "?", and its stamp on that day's map SHALL be white with a red "?" and the day. A plan for today SHALL be refused when none of the offered times is still at least 30 minutes ahead, saying to give a time.

#### Scenario: Run tomorrow, no time
- **WHEN** a person posts "run @southpoint tomorrow" on a Monday
- **THEN** the plan is listed under Tuesday with "Tue ?" for its time, and the Tuesday map shows a white stamp with a red "?" on Southpoint Park

#### Scenario: No day said
- **WHEN** a person posts "run @southpoint" at 3pm
- **THEN** the plan is for today with its time not set

#### Scenario: Too late today
- **WHEN** a person posts "run @southpoint" at 7:45pm with no time
- **THEN** the system refuses and asks for a time, like 8pm

#### Scenario: A time typed in the line
- **WHEN** a person posts "run @southpoint tomorrow 7am"
- **THEN** the plan has its time set to 7am and nobody is asked when works

### Requirement: When works
On a plan whose time is not set, each person in the plan other than the poster SHALL see "When works for you?" on the plan with up to five times on its day (7am, 9am, 12pm, 5pm, 7pm; for today only those at least 30 minutes ahead). One press SHALL mark a time as working for them, and a second press SHALL unmark it; they MAY mark several. Each time SHALL show the animals of the people in the plan who marked it, as far as the viewer may see them. Marks SHALL be kept only while the time is not set.

#### Scenario: Two times work
- **WHEN** a person in the plan presses 7am and 5pm
- **THEN** both show as theirs, and their animal shows on 7am and 5pm for everyone who can see them

#### Scenario: Changing their mind
- **WHEN** that person presses 5pm again
- **THEN** 5pm is no longer theirs

#### Scenario: Not in the plan
- **WHEN** a person who is not in the plan tries to mark a time
- **THEN** the system refuses

### Requirement: The poster sets the time
The poster SHALL see the same times with, on each, the animals of the people who marked it, and how many of the people in the plan have answered. The time most marked SHALL be lit (the earliest on a tie), and a "Send <time>" pill SHALL set it; the poster MAY press another time first to send that one. Setting the time SHALL make the plan an ordinary plan at that time for everyone, clear the marks, and show the people in it "<poster> set it: <day> at <time>." Nothing SHALL be set without the poster pressing Send. Only the poster or the admin SHALL be able to set it, and only to a time still ahead.

#### Scenario: Most can make 7am
- **WHEN** three people marked 7am and one marked 5pm, and the poster presses "Send 7am"
- **THEN** the plan is at 7am on its day, its stamp is the usual one, and the people in it see that the poster set it for 7am

#### Scenario: The poster picks another time
- **WHEN** 7am is lit and the poster presses 5pm and then "Send 5pm"
- **THEN** the plan is at 5pm

#### Scenario: Nobody has answered
- **WHEN** nobody has marked a time
- **THEN** no time is lit and Send cannot be pressed

#### Scenario: Someone else tries
- **WHEN** a person in the plan who did not post it tries to set its time
- **THEN** the system refuses

### Requirement: A time never set
A plan whose time is never set SHALL stay listed through its day and SHALL leave the list when its day ends. The poster SHALL still be able to change or cancel it through the day.

#### Scenario: The day ends
- **WHEN** a plan posted for Tuesday with no time reaches midnight after Tuesday without a time set
- **THEN** it is no longer in the list or on the map
