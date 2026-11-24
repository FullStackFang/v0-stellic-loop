## MODIFIED Requirements

### Requirement: Posting a plan
A signed-in person SHALL be able to post a plan with a title and a day within the next 14 days, and optionally a start time, an end time, a place and a line about it. A line that names no day SHALL be for today. On a campus where places are required, the plan SHALL also have a known place, given as the @ of that place or picked in the posting panel; a plan without one SHALL be refused with "Where do you meet? Pick a place." The plan SHALL appear in the campus list at once, with no approval, showing "Posted by" and the poster's first name to signed-in people. The poster SHALL be counted in.

#### Scenario: Running at 5
- **WHEN** a signed-in person posts "Running" for today at 5pm at the Arts Quad
- **THEN** the plan is in the list with them in it, and it has "good for" words that let "exercise" find it

#### Scenario: Too far ahead
- **WHEN** a person tries to post a plan that starts 20 days from now
- **THEN** the system refuses and says plans can be up to 14 days ahead

#### Scenario: Missing title
- **WHEN** a person submits the form with no title
- **THEN** the system refuses and no plan is created

#### Scenario: Signed out
- **WHEN** a signed-out visitor presses "Post a plan"
- **THEN** they are sent to sign in and afterwards to the post form

#### Scenario: No time
- **WHEN** a person posts "run @southpoint tomorrow" on Cornell Tech
- **THEN** the plan is posted for tomorrow with its time not set

#### Scenario: No place where places are required
- **WHEN** a person posts "run tomorrow 7am" on Cornell Tech
- **THEN** the system refuses and asks where they meet, and no plan is created

#### Scenario: An @ that is not a place
- **WHEN** a person posts "run tomorrow 7am @rooftop" on Cornell Tech and no place goes by "rooftop"
- **THEN** the system refuses and asks where they meet

#### Scenario: A campus without required places
- **WHEN** a person posts "run tomorrow 7am" on Cornell (Ithaca)
- **THEN** the plan is posted as before, without a place

### Requirement: Limit on posting
A person SHALL have at most three upcoming plans at once. A plan whose time is not set SHALL count until its day ends.

#### Scenario: Fourth plan
- **WHEN** a person with three upcoming plans posts another
- **THEN** the system refuses and says to cancel one or wait until one has passed

#### Scenario: One of them has no time yet
- **WHEN** a person has two plans with times and one for today with no time, and posts another
- **THEN** the system refuses

## ADDED Requirements

### Requirement: Cancelling a plan
The poster SHALL be able to cancel their plan from its details at any time until it ends, whether or not it has started and whether or not others are in; a second press SHALL confirm it. A cancelled plan SHALL leave the list and the map for everyone. Changing a plan stays open only until it starts (through its day while its time is not set). In place of "Leave", the poster SHALL see "Cancel this plan".

#### Scenario: Started, nobody else in
- **WHEN** a poster opens the details of their plan that started ten minutes ago and presses "Cancel this plan", then "Yes, cancel it"
- **THEN** the plan is no longer in the list or on the map

#### Scenario: Over
- **WHEN** a plan has ended
- **THEN** it can no longer be cancelled
