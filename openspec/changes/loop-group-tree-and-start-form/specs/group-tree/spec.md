## ADDED Requirements

### Requirement: A group can hold groups
A group SHALL be able to hold other groups, to any depth. An inner group SHALL have its own name, description, handle, record, files, events, asks, announcements, invitations and join link. Every team feature that works in a top-level group SHALL work the same way in an inner group.

#### Scenario: A group three levels deep
- **WHEN** an organizer of "EMBA 2027" starts "Team 1" inside it and then "NBAE 6830" inside "Team 1"
- **THEN** all three groups exist, "NBAE 6830" is inside "Team 1", and an event added to "NBAE 6830" appears only in "NBAE 6830"

#### Scenario: An inner group shows its own name
- **WHEN** a member opens an inner group, its share links or its join page
- **THEN** the name shown is the inner group's own name and not the top-level group's name

### Requirement: Handle of an inner group
An inner group's handle SHALL be `@namespace/slug`, where `namespace` is its top-level group's namespace, whatever its depth. The slug SHALL be unique in that namespace across groups, events and member handles, SHALL NOT be one of the reserved words `workspace`, `team`, `resources`, `in`, `new`, and SHALL NOT change after the group is made. Existing handles SHALL keep resolving to the same groups.

#### Scenario: Handle does not carry the path
- **WHEN** "NBAE 6830" is started inside "Team 1" inside `@emba-2027` with the slug `nbae-6830`
- **THEN** its handle is `@emba-2027/nbae-6830`

#### Scenario: Slug already used
- **WHEN** a person starts an inner group with a slug that an event, a member handle or another group in the same namespace already uses
- **THEN** the group is not made and the person is told the handle is taken

#### Scenario: Reserved slug
- **WHEN** a person starts an inner group with the slug `team`
- **THEN** the group is not made

### Requirement: Who may start a group inside a group
A signed-in person who is an owner or organizer of a group, directly or through a group above it, SHALL be able to start a group inside it from the site. No one else SHALL be able to. The person who starts it SHALL become its owner. Starting an inner group SHALL NOT be possible through an assistant.

#### Scenario: Organizer starts an inner group
- **WHEN** an organizer of "EMBA 2027" starts "Team 1" inside it
- **THEN** "Team 1" exists and the organizer is its owner

#### Scenario: Member cannot
- **WHEN** a member of "EMBA 2027" who is not an owner or organizer tries to start a group inside it
- **THEN** the request is refused and no group is made

#### Scenario: Assistant cannot
- **WHEN** a request to start an inner group arrives from an assistant connection
- **THEN** the request is refused

### Requirement: Who is in an inner group
A person SHALL be in a group when they hold a live role on that group or on any group above it. A person in a group SHALL be able to open every group inside it, with the role they hold above. A person who holds a role only on an inner group SHALL NOT be able to open any group above it or beside it.

#### Scenario: Outer member opens an inner group
- **WHEN** a member of "EMBA 2027" opens "Team 1"
- **THEN** they see its record and can answer its asks

#### Scenario: Inner-only member cannot open the outer group
- **WHEN** a person invited only to "Team 1" requests any page or tool result for "EMBA 2027"
- **THEN** the request is refused in the same way as for a group that does not exist

#### Scenario: Sibling groups are closed to each other
- **WHEN** a person invited only to "Team 1" requests "Team 2", another group inside "EMBA 2027"
- **THEN** the request is refused in the same way as for a group that does not exist

### Requirement: An inner-only person learns nothing about groups above
A person who holds a role only on an inner group SHALL NOT be shown the name, handle, events, asks, files or count of any group they cannot open, and SHALL NOT be shown the name or member handle of a person unless that person is in a group the viewer can open. This SHALL hold on the site and through an assistant, including tag suggestions and tag resolution.

#### Scenario: Tag suggestions leave out people above
- **WHEN** a person in "Team 1" only asks for tag suggestions, and "Marcus" is in "EMBA 2027" but holds no role that reaches "Team 1"
- **THEN** the suggestions do not include Marcus

#### Scenario: A handle from above does not resolve
- **WHEN** a person in "Team 1" only resolves the member handle of a person who is in "EMBA 2027" through a sibling group only
- **THEN** the handle is reported as not found

#### Scenario: Crumbs stop at the highest group the viewer can open
- **WHEN** a person in "Team 1" only opens "NBAE 6830" inside "Team 1"
- **THEN** the crumbs read "Team 1 › NBAE 6830" and do not name "EMBA 2027"

### Requirement: Joining one group does not disturb roles in others
Approving a membership request, accepting an invitation, or being admitted by a join link for one group SHALL NOT revoke or lower a live role the person holds on another group in the same top-level group.

#### Scenario: Organizer above accepts an invitation below
- **WHEN** an organizer of "EMBA 2027" accepts a member invitation to "Team 1"
- **THEN** they are still an organizer of "EMBA 2027"

#### Scenario: Request approved for a second inner group
- **WHEN** a member of "Team 1" only has a request approved for "Team 2"
- **THEN** they hold the member role on both "Team 1" and "Team 2"

### Requirement: Join link on an inner group
The owner of an inner group, directly or through a group above it, SHALL be able to turn on that group's join link and choose whether it admits on sign-in. A person who joins by an inner group's link SHALL receive the member role on that group only.

#### Scenario: Admitted to the inner group only
- **WHEN** a new person signs in from the admit link of "Team 1"
- **THEN** they can open "Team 1" and the groups inside it, and cannot open "EMBA 2027"

### Requirement: The tree is shown and can be walked
The rail SHALL list the groups the signed-in person can open as a tree, each inner group under its parent, or at the top when the person cannot open its parent. Every group page SHALL show crumbs from the highest group the person can open down to the current group, each a link. Every group page SHALL list the groups directly inside it. A person who may start a group inside it SHALL see "Start a group here" in that list.

#### Scenario: Rail shows the tree
- **WHEN** a member of "EMBA 2027" opens any group page
- **THEN** the rail shows "EMBA 2027" with "Team 1" under it and "NBAE 6830" under "Team 1"

#### Scenario: Inner-only person sees the inner group at the top
- **WHEN** a person in "Team 1" only opens the site
- **THEN** the rail shows "Team 1" at the top level with "NBAE 6830" under it

#### Scenario: Start a group here
- **WHEN** an organizer opens "Team 1"
- **THEN** the "Inside this group" list ends with "Start a group here", which opens the start form with "Team 1" chosen as where the group lives

#### Scenario: A member does not see it
- **WHEN** a member who is not an owner or organizer opens "Team 1"
- **THEN** "Start a group here" is not shown
