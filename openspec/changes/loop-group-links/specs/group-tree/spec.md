## MODIFIED Requirements

### Requirement: Who is in an inner group
A person SHALL be in a group when they hold a live role on that group or on any group above it. A group is above another when the other was built inside it or is placed inside it, at any depth, whether or not the two belong to the same top-level group. A person in a group SHALL be able to open every group inside it, with the role they hold above. A person who holds a role only on an inner group SHALL NOT be able to open any group above it or beside it.

#### Scenario: Outer member opens an inner group
- **WHEN** a member of "EMBA 2027" opens "Team 1"
- **THEN** they see its record and can answer its asks

#### Scenario: Outer member opens a placed group
- **WHEN** "NBAE 6561", a top-level group, is placed inside "Team 1" and a member of "Team 1" opens it
- **THEN** they see its record and can answer its asks

#### Scenario: Inner-only member cannot open the outer group
- **WHEN** a person invited only to "Team 1" requests any page or tool result for "EMBA 2027"
- **THEN** the request is refused in the same way as for a group that does not exist

#### Scenario: Sibling groups are closed to each other
- **WHEN** a person invited only to "Team 1" requests "Team 2", another group inside "EMBA 2027"
- **THEN** the request is refused in the same way as for a group that does not exist

### Requirement: An inner-only person learns nothing about groups above
A person who holds a role only on an inner group, built or placed, SHALL NOT be shown the name, handle, events, asks, files or count of any group they cannot open, and SHALL NOT be shown the name or member handle of a person unless that person is in a group the viewer can open. This SHALL hold on the site and through an assistant, including tag suggestions and tag resolution.

#### Scenario: Tag suggestions leave out people above
- **WHEN** a person in "Team 1" only asks for tag suggestions, and "Marcus" is in "EMBA 2027" but holds no role that reaches "Team 1"
- **THEN** the suggestions do not include Marcus

#### Scenario: A handle from above does not resolve
- **WHEN** a person in "Team 1" only resolves the member handle of a person who is in "EMBA 2027" through a sibling group only
- **THEN** the handle is reported as not found

#### Scenario: Crumbs stop at the highest group the viewer can open
- **WHEN** a person in "Team 1" only opens "NBAE 6830" inside "Team 1"
- **THEN** the crumbs read "Team 1 › NBAE 6830" and do not name "EMBA 2027"

#### Scenario: A placed group does not name where it sits
- **WHEN** a person who is only in "NBAE 6561" opens it while it is placed inside "Team 1"
- **THEN** the crumbs read "NBAE 6561" and nothing names "Team 1"
