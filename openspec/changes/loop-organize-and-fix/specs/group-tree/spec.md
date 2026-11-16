## MODIFIED Requirements

### Requirement: Who may start a group inside a group
A signed-in person who is an owner or organizer of a group, directly or through a group above it, SHALL be able to start a group inside it from the site, or through their assistant when that assistant holds a read-and-write grant covering the group. No one else SHALL be able to. The person who starts it SHALL become its owner.

#### Scenario: Organizer starts an inner group
- **WHEN** an organizer of "EMBA 2027" starts "Team 1" inside it
- **THEN** "Team 1" exists and the organizer is its owner

#### Scenario: Member cannot
- **WHEN** a member of "EMBA 2027" who is not an owner or organizer tries to start a group inside it
- **THEN** the request is refused and no group is made

#### Scenario: An organizer's assistant can
- **WHEN** a request to start an inner group arrives from the assistant of an organizer, and that assistant holds a read-and-write grant covering the group
- **THEN** the group is made and the organizer is its owner

#### Scenario: An assistant with a read grant cannot
- **WHEN** a request to start an inner group arrives from an assistant that holds a read grant only
- **THEN** the request is refused and no group is made
