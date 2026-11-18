## ADDED Requirements

### Requirement: A top-level group can be placed inside another group
A top-level group SHALL be able to be placed inside any other group, moved to a different one, and taken out to the top level again. A group SHALL have at most one place. A group that was built inside another group SHALL NOT be placeable. A placement SHALL be refused when it would put a group inside itself or inside a group that sits under it, or when the chain above the destination is deeper than 8.

#### Scenario: Placing a class inside a team
- **WHEN** a person who is an owner of "NBAE 6561" and of "Team 1" places "NBAE 6561" inside "Team 1"
- **THEN** "NBAE 6561" is shown under "Team 1"

#### Scenario: Taking it out
- **WHEN** the owner takes "NBAE 6561" out of "Team 1"
- **THEN** "NBAE 6561" is shown at the top level again

#### Scenario: No loop
- **WHEN** "Team 1" holds "NBAE 6561" and a person tries to place "Team 1" inside "NBAE 6561"
- **THEN** the placement is refused and nothing changes

#### Scenario: A built-in inner group does not move
- **WHEN** a request names a group that was built inside another group as the group to place
- **THEN** the request is refused

### Requirement: A placed group is open to the people of the group it sits in
While a group is placed, a person who holds a live role on the group it sits in, or on any group above that, SHALL be in the placed group with the role they hold above, on the site and through an assistant they have granted that group. People who hold a role on the placed group itself SHALL keep it. A person's role in the placed group SHALL be the strongest of the roles they hold on it and above it. An inherited role SHALL NOT be reducible on the placed group.

#### Scenario: Outer member opens the placed group
- **WHEN** "NBAE 6561" is placed inside "Team 1" and a member of "Team 1" who holds no role on "NBAE 6561" opens it
- **THEN** they see its record and can answer its asks

#### Scenario: Outer organizer runs the placed group
- **WHEN** an organizer of "Team 1" who holds no role on "NBAE 6561" adds an event to "NBAE 6561"
- **THEN** the event is added

#### Scenario: Direct member keeps access
- **WHEN** a person who holds the member role on "NBAE 6561" and no role on "Team 1" opens "NBAE 6561" after it is placed
- **THEN** they see it as before

#### Scenario: The stronger role wins
- **WHEN** a person is a member of "Team 1" and an organizer of "NBAE 6561"
- **THEN** in "NBAE 6561" they act as an organizer

### Requirement: Taking a group out or moving it removes what it inherited
When a placed group is taken out, people who were in it only through the group it sat in SHALL lose it at once, and people who hold a role on it directly SHALL keep it. When it is moved to another group, the people of the old outer group SHALL lose it on the same terms and the people of the new one SHALL gain it. No role SHALL be copied onto the placed group by placing it, and none SHALL be left on it by taking it out.

#### Scenario: Inherited access ends
- **WHEN** "NBAE 6561" is taken out of "Team 1" and a member of "Team 1" who holds no role on "NBAE 6561" requests it
- **THEN** the request is refused in the same way as for a group that does not exist

#### Scenario: Direct access stays
- **WHEN** "NBAE 6561" is taken out of "Team 1"
- **THEN** a person who holds the member role on "NBAE 6561" still opens it

#### Scenario: Moved from one team to another
- **WHEN** "NBAE 6561" is moved from "Team 1" to "Team 2"
- **THEN** a member of "Team 2" only can open it and a member of "Team 1" only cannot

#### Scenario: A dead assistant grant does nothing
- **WHEN** a person who granted their assistant "NBAE 6561" while they had it through "Team 1" loses it by the move
- **THEN** their assistant is refused "NBAE 6561"

### Requirement: Access does not flow upward through a place
A person who holds a role only on a placed group SHALL NOT be able to open the group it sits in, and SHALL NOT be shown that group's name, handle, events, asks, files, people or existence, on the site or through an assistant, including in crumbs, tag suggestions and tag resolution.

#### Scenario: Class-only person cannot open the team
- **WHEN** a person who is only in "NBAE 6561" requests any page or tool result for "Team 1"
- **THEN** the request is refused in the same way as for a group that does not exist

#### Scenario: Class-only person sees the class at the top
- **WHEN** a person who is only in "NBAE 6561" opens the Groups page
- **THEN** "NBAE 6561" is listed at the top level, its crumbs read "NBAE 6561", and nothing names "Team 1"

#### Scenario: Tag suggestions leave out the team's people
- **WHEN** a person who is only in "NBAE 6561" asks for tag suggestions, and "Marcus" is in "Team 1" only
- **THEN** the suggestions include neither "Team 1" nor Marcus

### Requirement: Placement changes nothing but place and inherited access
Placing, moving or taking out a group SHALL NOT change its handle, its page address, its share and join links, its record, files, events or asks, the roles held on it directly, or any assistant grant. A person who gains a group through its place SHALL NOT thereby have an assistant grant on it. A person who is in a placed group through the group above SHALL be shown and tagged there by the handle they hold in the group where they hold their role.

#### Scenario: The handle stays
- **WHEN** "NBAE 6561", with the handle `@nbae-6561`, is placed inside "Team 1"
- **THEN** its handle is still `@nbae-6561`, and `@nbae-6561` resolves to it for everyone who can open it

#### Scenario: An existing grant keeps working
- **WHEN** a direct member's assistant holds a grant on "NBAE 6561" and the group is placed, moved and taken out
- **THEN** the assistant reaches "NBAE 6561" throughout, under the same handle

#### Scenario: No grant by inheritance
- **WHEN** a member of "Team 1" whose assistant holds a grant on "Team 1" gains "NBAE 6561" through its place
- **THEN** their assistant does not list or reach "NBAE 6561" until they grant it

#### Scenario: Tagging a person who is in through the team
- **WHEN** Priya is in "NBAE 6561" only through "Team 1", where her handle is `priya`
- **THEN** tag suggestions in "NBAE 6561" offer her as `@team-1/priya`

### Requirement: Who may move a group
Placing or moving a group SHALL require the signed-in person to be an owner or organizer of that group and of the destination, directly or through a group above. Taking a group out SHALL require the person to be an owner or organizer of that group, directly or through a group above, which includes the group it sits in. Moving SHALL be possible from the site only, never through an assistant.

#### Scenario: Member cannot place
- **WHEN** a member of "NBAE 6561" who is not an owner or organizer tries to place it inside "Team 1"
- **THEN** the request is refused and nothing changes

#### Scenario: Not an organizer of the destination
- **WHEN** an owner of "NBAE 6561" who is only a member of "Team 1" tries to place it there
- **THEN** the request is refused

#### Scenario: The outer group's organizer takes it out
- **WHEN** an organizer of "Team 1" who holds no role on "NBAE 6561" takes "NBAE 6561" out of "Team 1"
- **THEN** "NBAE 6561" returns to the top level, and that organizer can no longer open it

#### Scenario: Assistant cannot
- **WHEN** a move request arrives from an assistant connection
- **THEN** the request is refused

### Requirement: A move states who gains and who loses access before it is saved
Before a move is saved, the site SHALL tell the person how many people will gain access to the group and how many will lose it, and SHALL save the move only after they confirm. A move that changes nobody's access SHALL be saved without asking. Every move SHALL be recorded with who made it and when.

#### Scenario: Confirming a move in
- **WHEN** an owner drops "NBAE 6561" on "Team 1", which has 12 people who are not in "NBAE 6561"
- **THEN** the site says 12 people in "Team 1" will be able to open "NBAE 6561", and the group moves only when the owner confirms

#### Scenario: Cancelling
- **WHEN** the owner cancels the confirmation
- **THEN** nothing changes

#### Scenario: Nothing to confirm
- **WHEN** every person in "Team 1" already holds a role on "NBAE 6561"
- **THEN** the move is saved without a confirmation

### Requirement: Moving a group on the Groups page
On the Groups page, a person SHALL be able to move a group they may move by dragging its row onto a group they may place it in, or onto "Top level". Each such row SHALL also offer "Move to", listing the same destinations, usable by touch and by keyboard. Once confirmed, the list SHALL show the group in its new place at once and SHALL put it back, with a message, if the move is refused. Rows the person may not move SHALL offer neither.

#### Scenario: Drag onto a group
- **WHEN** an owner drags "NBAE 6561" onto "Team 1" and confirms
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

### Requirement: Placement adds no statements to a page view
Listing a person's groups with their places SHALL take the same number of database statements as before this change, for a person with placed groups and for a person with none.

#### Scenario: Statement count
- **WHEN** a signed-in person with placed groups opens a group page
- **THEN** the group listing runs no more statements than it did before this change
