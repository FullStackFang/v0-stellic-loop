## ADDED Requirements

### Requirement: A known account is identified without a transaction
For a request from an account the site already knows, with nothing about the person to write, the site SHALL identify the person with one database statement and SHALL take no lock. That statement SHALL refuse an account whose sign-in was revoked and a person who deleted their data, exactly as before. An account not yet known, or one whose name is still to be filled in, SHALL be enrolled under the same locks as before. The checks made with the sign-in provider SHALL be unchanged.

#### Scenario: A member opens a page
- **WHEN** a member who has signed in before opens any page
- **THEN** the person is identified by one statement, and no row is locked or written to do it

#### Scenario: A first sign-in
- **WHEN** an account the site has never seen opens a page
- **THEN** the person is created under the account's lock, once, as before

#### Scenario: A revoked sign-in
- **WHEN** an account's sign-in has been revoked and it opens a page
- **THEN** nobody is signed in

#### Scenario: A person who deleted their data
- **WHEN** a person who deleted their data opens a page with the same account
- **THEN** nobody is signed in

### Requirement: The counters use the page view's groups
On the site, the "On you" counters SHALL take the person's groups from the listing the page view already made and SHALL NOT list them again. What the counters show SHALL be unchanged. For an assistant, the listing and its consent checks SHALL be made as before.

#### Scenario: A page with a bar
- **WHEN** a signed-in member loads a page with the bar
- **THEN** the member's groups are listed once for the bar, the page and the counters together

#### Scenario: A group lost since the listing
- **WHEN** a member's role in a group is revoked after the listing and before the counters read that group
- **THEN** that group's read is refused and it adds nothing to the counters

### Requirement: The account card is read on its own
A bar that is not on the week page SHALL read only what its account card shows, and SHALL NOT read or send the week's events, places or other people's pictures. The card SHALL show what it showed before. If its read fails, the bar SHALL fall back to the plain card as before.

#### Scenario: A groups page
- **WHEN** a signed-in member loads a groups page
- **THEN** the account card shows their face, plan, level, colours and links, and no event of the week is read for it

#### Scenario: The card cannot be read
- **WHEN** the account card's read fails
- **THEN** the bar shows the plain card with the colours, the links and the way out

### Requirement: The Assistants page reads together
The Assistants page SHALL start the reads it needs together and SHALL read the person's grants, the grants ended by a removed group and the clock in one transaction with one check of the person and one `lease:list` record.

#### Scenario: A member with Ink+ opens Assistants
- **WHEN** the page is opened
- **THEN** its grants are read in one transaction and recorded once

#### Scenario: A member without Ink+
- **WHEN** the page is opened
- **THEN** the page shows only that Assistants come with Ink+, and no grant is read

## MODIFIED Requirements

### Requirement: Access checks and read records are kept
Every read that runs SHALL make the same checks of the person, the sign-in and the role, inside its own transaction, as it made before this change. Within one transaction, a check of the same person and the same group that has already been made, and whose rows that transaction holds locked, MAY stand for the rest of that transaction; it SHALL NOT stand for any other transaction or request. On the site, the listing of a member's own groups SHALL check the person and their roles once, with those rows locked until the listing commits. Every read by an assistant that recorded a `plan:read` before this change SHALL still record it. A member's own view of their groups on the site (the listing, a group's team reads, and a team write that saves nothing) SHALL NOT be recorded as a `plan:read`; every other record, the site's included, SHALL be kept.

#### Scenario: Access removed while a page is open
- **WHEN** an owner removes a member and the member then opens a tab
- **THEN** the member is shown that the group is unavailable

#### Scenario: An assistant's read is recorded
- **WHEN** an assistant reads a team's state or brief
- **THEN** each has a `plan:read` record naming the group

#### Scenario: A member's own view is not recorded
- **WHEN** a member opens their team page on the site
- **THEN** no `plan:read` record is written for it

#### Scenario: The site lists groups with one check
- **WHEN** a member's groups are listed on the site
- **THEN** their roles are checked once, under lock, and a role revoked before the listing leaves that group out

#### Scenario: A check does not outlive its transaction
- **WHEN** a member's role is revoked between two reads of the same group made in separate transactions
- **THEN** the second read is refused
