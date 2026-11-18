## ADDED Requirements

### Requirement: Posting a plan
A signed-in person SHALL be able to post a plan with a title and a start time within the next 14 days, and optionally an end time, a place and a line about it. The plan SHALL appear in the campus list at once, with no approval, showing "Posted by" and the poster's first name to signed-in people. The poster SHALL be counted in.

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

### Requirement: A plan is open to join
A plan SHALL have one outing, started when it is posted, that any signed-in person can join from the campus screen without a link.

#### Scenario: A stranger joins
- **WHEN** a signed-in person who does not know the poster presses "I'm in" on a plan
- **THEN** they are in the plan's outing

### Requirement: Changing and cancelling a plan
The poster SHALL be able to change or cancel their plan until it starts. Nobody else except the admin SHALL be able to. A cancelled plan SHALL leave the list.

#### Scenario: Move the time
- **WHEN** the poster changes their plan from 5pm to 6pm before it starts
- **THEN** the list shows 6pm and the people in it stay in

#### Scenario: Cancel
- **WHEN** the poster cancels their plan
- **THEN** it no longer appears in the list

#### Scenario: Someone else tries
- **WHEN** a person who did not post a plan tries to change it
- **THEN** the system refuses

#### Scenario: After it started
- **WHEN** the poster tries to change a plan that has already started
- **THEN** the system refuses

### Requirement: Limit on posting
A person SHALL have at most three upcoming plans at once.

#### Scenario: Fourth plan
- **WHEN** a person with three upcoming plans posts another
- **THEN** the system refuses and says to cancel one or wait until one has passed
