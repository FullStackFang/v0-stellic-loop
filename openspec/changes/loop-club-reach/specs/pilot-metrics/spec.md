## ADDED Requirements

### Requirement: Every connector request is logged by route, not by content
For each request to the team connector Loop SHALL record: the time, the member, the host name and version the assistant stated when connecting, the connector session where one exists, the tool called, whether the call came from the model or from a card control, and whether it was the first Loop tool call in that session. Tool arguments and results SHALL NOT be written to this log.

#### Scenario: A card tap is told apart from a model call
- **WHEN** a member taps an option in the card and later types an answer the assistant submits
- **THEN** the log holds one entry marked as from the card and one marked as from the model

#### Scenario: No content in the log
- **WHEN** a member answers a written ask
- **THEN** the log entry names the tool and route and contains none of the answer's text

### Requirement: Whether assistants check Loop first is reported per host
The operator SHALL be able to see, per host: members who connected at least once; sessions in which the waiting tool was the first call; sessions in which Loop was first called later; and sessions that connected and called no tool. The page SHALL state that conversations in which the host never contacted Loop cannot be seen.

#### Scenario: Check-first rate
- **WHEN** the operator opens the page after a week of pilot use
- **THEN** they see for each host how many sessions started with the waiting tool, how many called Loop late, and how many called nothing

### Requirement: The connecting funnel is reported
Loop SHALL record, per member and host, each step it can observe: joined a group, opened the connect page, completed sign-in from an assistant, granted a group to that assistant, made a first tool call. The operator SHALL be able to see how many members reached each step.

#### Scenario: Drop-off at granting
- **WHEN** ten members sign in from an assistant and six grant a group
- **THEN** the page shows ten at sign-in and six at grant

### Requirement: Answers and interest record how they arrived
Each answer and interest mark SHALL record its route: site, share link, personal link, assistant by model, assistant by card, or WhatsApp button. The operator SHALL be able to see, per group, the share of members who answered within 48 hours by route, and the median time from an ask being created to closed.

#### Scenario: Route split
- **WHEN** an ask closes with five answers by personal link, three by card and two on the site
- **THEN** the page shows that split for the ask's group

### Requirement: Numbers are aggregate and operator-only
The metrics page and its CSV export SHALL be available to the operator only, behind operator sign-in. No number SHALL be broken down to a single member. Organizers and members SHALL NOT have access.

#### Scenario: Organizer requests the page
- **WHEN** a group's organizer requests the metrics page
- **THEN** it is refused

#### Scenario: Export
- **WHEN** the operator exports the numbers
- **THEN** the CSV has one row per group and period, and no row per member

### Requirement: A plain guide to connecting
The connect page SHALL give steps a non-technical member can follow to add Loop in each supported assistant, state which plans allow a custom connector, and show a picture beside each step. It SHALL name the assistant features in the words that assistant uses.

#### Scenario: Member on a plan without connectors
- **WHEN** a member reads the guide for an assistant whose plan does not allow custom connectors
- **THEN** the guide says so and points them to the site and the links, which need no assistant
