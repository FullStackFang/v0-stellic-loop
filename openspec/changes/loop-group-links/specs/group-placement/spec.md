## ADDED Requirements

### Requirement: A top-level group can be placed inside another group
A top-level group SHALL be able to be placed inside any other group, moved to a different one, and taken out to the top level again. A group SHALL have at most one place. A group that was built inside another group SHALL NOT be placeable. A placement SHALL be refused when it would put a group inside itself or inside a group that sits under it, or when the chain above the destination is deeper than 8.

#### Scenario: Placing a class inside a team
- **WHEN** an owner of "NBAE 6561" and of "Team 1" places "NBAE 6561" inside "Team 1"
- **THEN** "NBAE 6561" is shown under "Team 1" for everyone who can open both

#### Scenario: Taking it out
- **WHEN** the owner takes "NBAE 6561" out of "Team 1"
- **THEN** "NBAE 6561" is shown at the top level again

#### Scenario: No loop
- **WHEN** "Team 1" holds "NBAE 6561" and a person tries to place "Team 1" inside "NBAE 6561"
- **THEN** the placement is refused and nothing changes

#### Scenario: A built-in inner group does not move
- **WHEN** a request names a group that was built inside another group as the group to place
- **THEN** the request is refused

### Requirement: Placement changes only where a group is shown
Placing, moving or taking out a group SHALL NOT change its handle, its page address, its share and join links, its members and roles, its assistant grants, or who can open it. A person in the outer group SHALL NOT gain access to a placed group, and a person in a placed group SHALL NOT gain access to the outer group. Tags and assistant tool results SHALL be the same before and after.

#### Scenario: The handle stays
- **WHEN** "NBAE 6561", with the handle `@nbae-6561`, is placed inside "Team 1"
- **THEN** its handle is still `@nbae-6561` and `@nbae-6561` still resolves to it

#### Scenario: Outer members gain nothing
- **WHEN** "NBAE 6561" is placed inside "Team 1" and a member of "Team 1" who is not in "NBAE 6561" requests it
- **THEN** the request is refused in the same way as for a group that does not exist

#### Scenario: An assistant's grant is untouched
- **WHEN** a member's assistant holds a grant on "NBAE 6561" and the group is placed, moved and taken out
- **THEN** the assistant reaches "NBAE 6561" throughout, under the same handle

### Requirement: Who may place a group
Placing or moving a group SHALL require the signed-in person to be an owner or organizer of that group and of the destination. Taking a group out SHALL require the person to be an owner or organizer of the group or of the group it sits in. Placing SHALL be possible from the site only, never through an assistant.

#### Scenario: Member cannot place
- **WHEN** a member of "NBAE 6561" who is not an owner or organizer tries to place it inside "Team 1"
- **THEN** the request is refused and nothing changes

#### Scenario: Not an organizer of the destination
- **WHEN** an owner of "NBAE 6561" who is only a member of "Team 1" tries to place it there
- **THEN** the request is refused

#### Scenario: The outer group's organizer clears it
- **WHEN** an organizer of "Team 1" who holds no role on "NBAE 6561" that lets them manage it takes "NBAE 6561" out of "Team 1"
- **THEN** "NBAE 6561" returns to the top level

#### Scenario: Assistant cannot
- **WHEN** a placement request arrives from an assistant connection
- **THEN** the request is refused

### Requirement: Placed groups appear in the tree, and only to people who can open both
The rail, the Groups page, crumbs and each group's "Inside this group" list SHALL show a placed group under the group it is placed in, for a person who can open both. A person who cannot open the outer group SHALL see the placed group at the top level and SHALL NOT be shown the outer group's name, handle or existence.

#### Scenario: Seen by someone in both
- **WHEN** a person in "Team 1" and in "NBAE 6561" opens the Groups page
- **THEN** "NBAE 6561" is listed under "Team 1", and its crumbs read "Team 1 › NBAE 6561"

#### Scenario: Seen by someone in the class only
- **WHEN** a person in "NBAE 6561" only opens the Groups page
- **THEN** "NBAE 6561" is listed at the top level and nothing names "Team 1"

### Requirement: Moving a group on the Groups page
On the Groups page, a person SHALL be able to move a group they may place by dragging its row onto a group they may place it in, or onto "Top level". Each such row SHALL also offer "Move to", listing the same destinations, usable by touch and by keyboard. The list SHALL show the group in its new place at once and SHALL put it back, with a message, if the move is refused. Rows the person may not move SHALL offer neither.

#### Scenario: Drag onto a group
- **WHEN** an owner drags "NBAE 6561" onto "Team 1"
- **THEN** "NBAE 6561" appears under "Team 1" without a page reload, and stays there after one

#### Scenario: Move to, by keyboard
- **WHEN** an owner opens "Move to" on "NBAE 6561" with the keyboard and chooses "Top level"
- **THEN** "NBAE 6561" is shown at the top level

#### Scenario: A refused move is undone
- **WHEN** a move is refused by the server
- **THEN** the row returns to where it was and the page says the group could not be moved

### Requirement: The tree can be collapsed
On the Groups page and in the rail, a group with groups under it SHALL have a control that hides or shows them. The choice SHALL be remembered in that browser. A group is open until the person closes it. The rail SHALL always show the current group, opening what it sits inside if needed.

#### Scenario: Closing a group
- **WHEN** a person closes "Team 1" on the Groups page and reloads
- **THEN** "Team 1" is listed and the groups under it are not, until the person opens it again

#### Scenario: The current group stays visible in the rail
- **WHEN** a person who closed "Team 1" opens "NBAE 6561", which sits under it
- **THEN** the rail shows "NBAE 6561" under "Team 1"

### Requirement: Placement adds no cost to a page view and tolerates a database without it
Listing a person's groups with their places SHALL take the same number of database statements as before this change. On a database where the placement table does not exist yet, every page SHALL work as before this change, with all groups shown as built and moving reported as not available.

#### Scenario: Statement count
- **WHEN** a signed-in person with placed groups opens a group page
- **THEN** the group listing runs no more statements than it does for a person with none

#### Scenario: Table not there yet
- **WHEN** the site runs against a database without the placement table
- **THEN** the Groups page lists the person's groups and a move answers that moving is not available yet
