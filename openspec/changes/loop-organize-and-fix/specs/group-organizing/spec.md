## ADDED Requirements

### Requirement: A group can be renamed
An owner or organizer of a group, directly or through a group above it, SHALL be able to change its name, 1 to 200 characters. Its handle, page address and links SHALL NOT change.

#### Scenario: Rename keeps the handle
- **WHEN** an organizer renames "NBAE 6561 Investment Banking" to "Investment Banking"
- **THEN** every page shows "Investment Banking" and `@team-1/nbae-6561` still resolves to it

#### Scenario: Member cannot rename
- **WHEN** a member who is not an owner or organizer tries to rename a group
- **THEN** the request is refused and the name is unchanged

### Requirement: A group can be archived
An owner or organizer of a group built inside another, and the owner of a top-level group, SHALL be able to archive it. Archiving SHALL hide the group and every group under it from the Groups page, the rail, tags and assistants, SHALL end every assistant grant made on those groups, and SHALL delete nothing. A pending invitation to an archived group SHALL NOT be acceptable.

#### Scenario: Archiving a finished class
- **WHEN** an organizer archives "NBAE 6561"
- **THEN** it is no longer listed for anyone, its handle no longer resolves, and its record is kept

#### Scenario: What is under it goes with it
- **WHEN** the owner archives "Team 1", which has "NBAE 6561" and "NBAE 6830" inside it
- **THEN** none of the three is listed

#### Scenario: Grants on it end
- **WHEN** "NBAE 6561" is archived while a person's assistant holds a grant on "NBAE 6561" itself
- **THEN** that grant is ended

#### Scenario: Member cannot archive
- **WHEN** a member who is not an owner or organizer tries to archive a group
- **THEN** the request is refused and the group stays listed

#### Scenario: Only the owner archives a top-level group
- **WHEN** an organizer of "Team 1" who is not its owner tries to archive "Team 1"
- **THEN** the request is refused

#### Scenario: Invitation to an archived group
- **WHEN** a person tries to accept an invitation to "NBAE 6561" after it is archived
- **THEN** the invitation is not accepted and the person is told the group is no longer open

### Requirement: An archived group can be restored
The people who may archive a group SHALL be able to restore it from the site. Restoring SHALL bring back the group and the groups that were archived with it in the same act, with their records, members, links and handles as they were. A group that was archived on its own earlier SHALL stay archived when a group above it is restored. Restoring SHALL be refused while the group it sits in is archived. Restoring SHALL NOT bring back assistant grants that archiving ended.

#### Scenario: Restoring a class
- **WHEN** the organizer restores "NBAE 6561"
- **THEN** it is listed again with its record, members, links and handle as they were

#### Scenario: Archived together, restored together
- **WHEN** "Team 1" is archived with "NBAE 6561" inside it, and then restored
- **THEN** both are listed again

#### Scenario: Archived earlier stays archived
- **WHEN** "NBAE 6561" was archived on its own, then "Team 1" is archived and restored
- **THEN** "Team 1" is listed and "NBAE 6561" is still archived

#### Scenario: Not under an archived group
- **WHEN** a person tries to restore "NBAE 6561" while "Team 1" is archived
- **THEN** the request is refused

#### Scenario: A grant on the team covers it again
- **WHEN** "NBAE 6561" is restored and a person's assistant holds a live grant on "Team 1"
- **THEN** that assistant reaches "NBAE 6561" again without a new grant

### Requirement: Archived groups are listed for the people who can restore them
The Groups page SHALL list, below a person's groups, the archived groups that person may restore, each with Restore. A person who may not restore a group SHALL NOT be shown that it exists.

#### Scenario: Organizer sees the archived list
- **WHEN** an organizer who archived "NBAE 6561" opens the Groups page
- **THEN** "NBAE 6561" is listed under "Archived" with Restore

#### Scenario: Member does not
- **WHEN** a member of "Team 1" who is not an owner or organizer opens the Groups page after "NBAE 6561" is archived
- **THEN** nothing names "NBAE 6561"

### Requirement: Organizing from the Groups page
On the Groups page, each group a person may rename SHALL offer a menu with Rename, and with Archive where the person may archive it, usable by keyboard and touch. Archive SHALL ask once before it saves, naming the groups that will be hidden. Groups the person does not run SHALL offer no menu.

#### Scenario: Renaming from the menu
- **WHEN** an organizer opens the menu on "NBAE 6561", chooses Rename and saves a new name
- **THEN** the list shows the new name

#### Scenario: Archive asks first
- **WHEN** the owner chooses Archive on "Team 1"
- **THEN** the page names "Team 1", "NBAE 6561" and "NBAE 6830" as the groups that will be hidden, and archives only after the owner confirms

#### Scenario: Organizer of a top-level group
- **WHEN** an organizer of "Team 1" who is not its owner opens the menu on "Team 1"
- **THEN** the menu offers Rename and no Archive

#### Scenario: Member sees no menu
- **WHEN** a member who runs no group opens the Groups page
- **THEN** no row offers a menu

### Requirement: The tree can be collapsed
On the Groups page and in the rail, a group with groups under it SHALL have a control that hides or shows them. The choice SHALL be remembered in that browser. A group is open until the person closes it. A group the person closed SHALL NOT be shown open and then closed when the page loads. The rail SHALL always show the current group, opening what it sits inside if needed.

#### Scenario: Closing a group
- **WHEN** a person closes "Team 1" on the Groups page and reloads
- **THEN** "Team 1" is listed and the groups under it are not, until the person opens it again

#### Scenario: The current group stays visible in the rail
- **WHEN** a person who closed "Team 1" opens "NBAE 6561", which is inside it
- **THEN** the rail shows "NBAE 6561" under "Team 1"
