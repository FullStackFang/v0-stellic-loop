## ADDED Requirements

### Requirement: A grant covers the group and the groups built inside it
A live grant a person gave an assistant on a group SHALL also let that assistant reach every group built inside that group, at any depth, that the person can open, including groups started there after the grant was made. The assistant SHALL list those groups and read and write in them as the grant allows. A grant on a group SHALL NOT reach a group above it or beside it.

#### Scenario: One grant for a team
- **WHEN** a person grants their assistant read and write on "Team 1", which has "NBAE 6561" and "NBAE 6830" inside it
- **THEN** the assistant lists all three and can file a link in "NBAE 6561"

#### Scenario: A group started later
- **WHEN** "NBAE 6900" is started inside "Team 1" after the grant
- **THEN** the assistant reaches "NBAE 6900" without a new grant

#### Scenario: Not upward
- **WHEN** a person grants their assistant "NBAE 6561" only
- **THEN** the assistant does not list or reach "Team 1" or "NBAE 6830"

#### Scenario: Only what the person can open
- **WHEN** a person loses access to "Team 1" while their grant on it is live
- **THEN** their assistant is refused "Team 1" and the groups inside it

### Requirement: Any covering grant that allows an action allows it
An assistant SHALL be allowed an action in a group when a live grant on that group, or on any group above it, allows that action. There SHALL be no order of precedence between grants.

#### Scenario: Read on the class, read and write on the team
- **WHEN** a person grants their assistant read and write on "Team 1" and read only on "NBAE 6561"
- **THEN** the assistant can write in "NBAE 6561"

#### Scenario: Read on the team, read and write on one class
- **WHEN** a person grants their assistant read only on "Team 1" and read and write on "NBAE 6561"
- **THEN** the assistant can write in "NBAE 6561" and can only read in "Team 1" and "NBAE 6830"

### Requirement: Ending a grant ends what it covered
Revoking a grant, or its expiry, SHALL end the assistant's reach to the group and to every group it reached only through that grant, at once.

#### Scenario: Revoking the team's grant
- **WHEN** a person revokes their assistant's grant on "Team 1" and holds no other grant for it
- **THEN** the assistant lists none of "Team 1", "NBAE 6561" and "NBAE 6830"

#### Scenario: A grant of its own survives
- **WHEN** the person also granted "NBAE 6561" on its own and revokes the grant on "Team 1"
- **THEN** the assistant still reaches "NBAE 6561"

### Requirement: The Assistants page says what a grant covers and allows
The Assistants page SHALL say, where a grant is given, that it covers the group and the groups inside it, including ones added later, and SHALL show for each grant the groups it currently covers. Where it describes read-and-write access, it SHALL say that for an owner or organizer this includes starting, renaming and archiving groups inside the team and inviting people.

#### Scenario: Granting a team
- **WHEN** a person is about to grant "Team 1"
- **THEN** the page says the assistant will also reach the groups inside "Team 1", including ones added later

#### Scenario: A grant's row
- **WHEN** a person looks at their grant on "Team 1"
- **THEN** the row names "NBAE 6561" and "NBAE 6830" as covered

#### Scenario: What read and write allows
- **WHEN** a person reads what each level of access allows
- **THEN** read and write is described as including organizing groups and inviting people, for owners and organizers
