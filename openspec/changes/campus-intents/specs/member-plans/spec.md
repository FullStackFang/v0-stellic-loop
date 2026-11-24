## MODIFIED Requirements

### Requirement: Posting a plan
A person's plan SHALL be posted only as a proposal on an intent (see campus-intents): from Propose on an intent, or from a posted line that names a time and a place. A plan SHALL have a title (its intent's), a day within the next 14 days, a start time, and a place; it MAY have an end time and a line about it. On a campus where places are required, the place SHALL be a known place, given as the @ of that place or picked; a plan without one SHALL be refused with "Where do you meet? Pick a place." A plan SHALL NOT be posted with a day and no time. The plan SHALL appear in the campus list at once, with no approval, and SHALL NOT show who posted it. The poster SHALL be counted in.

#### Scenario: Running at 5
- **WHEN** a signed-in person in the intent "Running" proposes today at 5pm at the Arts Quad
- **THEN** the plan is in the list with them in it, it has "good for" words that let "exercise" find it, and it names no poster

#### Scenario: Too far ahead
- **WHEN** a person tries to propose a plan that starts 20 days from now
- **THEN** the system refuses and says plans can be up to 14 days ahead

#### Scenario: Signed out
- **WHEN** a signed-out visitor presses the posting "+"
- **THEN** they are sent to sign in and afterwards to the posting panel

#### Scenario: No time
- **WHEN** a person tries to propose "run @southpoint tomorrow" with no time
- **THEN** no plan is posted and Propose asks for a time

#### Scenario: No place where places are required
- **WHEN** a person tries to propose for tomorrow at 7am on Cornell Tech without a place
- **THEN** the system refuses and asks where they meet, and no plan is created

#### Scenario: A campus without required places
- **WHEN** a person proposes for tomorrow at 7am on Cornell (Ithaca) with a typed place
- **THEN** the plan is posted with that place text

### Requirement: Limit on posting
A person SHALL have at most three upcoming plans at once, proposals included. A plan whose time is not set, posted before this change, SHALL count until its day ends.

#### Scenario: Fourth plan
- **WHEN** a person with three upcoming plans proposes another
- **THEN** the system refuses and says to cancel one or wait until one has passed

#### Scenario: An old plan with no time yet
- **WHEN** a person has two plans with times and one posted earlier for today with no time, and proposes another
- **THEN** the system refuses
