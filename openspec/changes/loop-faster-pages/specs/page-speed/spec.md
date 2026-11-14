## ADDED Requirements

### Requirement: A page view checks sign-in and lists groups once
Within one page view under `/groups`, the site SHALL check who is signed in once and SHALL list that person's groups once, however many parts of the page (the side menu, the page itself) need them. An action SHALL check sign-in afresh every time and SHALL NOT reuse a result from a page view.

#### Scenario: A group page with a side menu
- **WHEN** a signed-in member opens a group's page
- **THEN** the side menu and the page are drawn from one sign-in check and one listing of the member's groups

#### Scenario: The connections page
- **WHEN** a signed-in member opens the connections page
- **THEN** the side menu and the page's list of groups come from one listing

#### Scenario: An action after a page view
- **WHEN** a member submits a form on a page
- **THEN** the action checks the member's sign-in again before doing anything

### Requirement: On the site, listing groups costs the same for many groups as for one
For a person signed in to the site, listing the groups they can open SHALL take a number of database statements that does not grow with the number of groups. It SHALL make the same access checks for every group as it makes for one, and SHALL record a read of every group listed. For an assistant, the listing SHALL make the same access and consent checks as before; its cost MAY grow with the number of groups.

#### Scenario: A person in four groups and a person in one
- **WHEN** each person's groups are listed on the site
- **THEN** both listings take the same number of statements, and each listed group has its own read record

#### Scenario: A group the person lost access to
- **WHEN** a person's role in one of their groups is revoked and their groups are listed
- **THEN** that group is not in the list

#### Scenario: The same group id under another organization
- **WHEN** access to several groups is checked at once and one is named with an organization it does not belong to
- **THEN** the check fails

### Requirement: Showing a list costs the same for many items as for one
Building the view of a list of records, asks or interested people SHALL take a number of database statements that does not grow with the number of items: at most three for a list of records and at most three for a list of asks. The view returned to the site and to an assistant SHALL hold the same fields and values as before this change. Where the order of people was not stated before, it SHALL be stated and the same on every run.

#### Scenario: Twenty records and one record
- **WHEN** a team with twenty current decisions and a team with one are each read
- **THEN** both reads take the same number of statements

#### Scenario: An assistant reads the team's state
- **WHEN** an assistant calls a team tool before and after this change on the same data
- **THEN** the answers hold the same fields and values

#### Scenario: A name never reaches an assistant
- **WHEN** an assistant reads a list that names people
- **THEN** each person is shown by handle only, as before

### Requirement: The team page reads only what it shows
The team page SHALL make the reads its header needs and the reads its chosen tab needs, and SHALL NOT make a read that only another tab needs. A read that does not run SHALL NOT be recorded.

#### Scenario: The decisions tab
- **WHEN** a member opens a team page on its decisions tab
- **THEN** the page does not list asks, read the brief's history, read the member's own saves, or list upcoming or archived events

#### Scenario: The tab bar's counts
- **WHEN** a member opens any tab
- **THEN** the tab bar shows the same counts as before, including the number of open asks

#### Scenario: Switching to the asks tab
- **WHEN** the member chooses the asks tab
- **THEN** the page lists the asks and shows them

#### Scenario: A member who is not a manager
- **WHEN** a member who is neither owner nor organizer opens any tab
- **THEN** the page shows no editing controls and no archived events, exactly as before

### Requirement: A group page does not wait for the group listing before it reads
A group page SHALL start its reads once its address says which group is meant, without waiting for the listing of the person's groups. It SHALL show the group only when that listing holds it, and every read SHALL still check the person's access itself.

#### Scenario: A member opens a team page
- **WHEN** a member opens a team page
- **THEN** the page's reads and the listing of the member's groups run side by side

#### Scenario: A person outside the group opens its address
- **WHEN** a signed-in person who cannot open the group opens its team page
- **THEN** every read is refused, the page says the group is unavailable, and no read of the group is recorded

### Requirement: Access checks and read records are kept
Every read that runs SHALL make the same checks of the person, the sign-in and the role, inside its own transaction, as it made before this change. Every read that recorded a `plan:read` before this change SHALL still record it when it runs.

#### Scenario: Access removed while a page is open
- **WHEN** an owner removes a member and the member then opens a tab
- **THEN** the member is shown that the group is unavailable

#### Scenario: A read is recorded
- **WHEN** a member opens a team page
- **THEN** the team's state and brief each have a `plan:read` record naming the group

### Requirement: A group page answers a tap
Opening a group page from another page under `/groups` SHALL show a loading state until the page is ready.

#### Scenario: Opening a team page from the side menu
- **WHEN** a member taps a team in the side menu
- **THEN** a loading state appears in the page's place, and the side menu stays

### Requirement: Production runs beside the database
The site's server functions SHALL run in the region of the database.

#### Scenario: A deploy
- **WHEN** the site is deployed
- **THEN** its functions run in Portland (`pdx1`), where the database is

### Requirement: The cost of a page view is measured and held
The repository SHALL hold a read-only script that reports the number of statements and the time of each of a page view's reads against the configured database, and tests that fail when a list or the site's group listing costs more statements for more items.

#### Scenario: Measuring
- **WHEN** the script is run
- **THEN** it prints statements and time per read, and leaves the database unchanged

#### Scenario: A change that brings back a per-item query
- **WHEN** a list builder is changed to run one statement per item
- **THEN** a test fails
