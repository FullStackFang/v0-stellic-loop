## ADDED Requirements

### Requirement: Who may make a group's picture
The system SHALL offer "Group picture" on a group only to a person who runs it: its owner or an organizer, on the group itself or on a group above it. The system SHALL refuse the same act from anyone else, whatever the page showed.

#### Scenario: The person who started the group
- **WHEN** the person who started a group opens it
- **THEN** "Group picture" is offered

#### Scenario: A member who does not run the group
- **WHEN** a member who is neither owner nor organizer opens the group
- **THEN** "Group picture" is not offered, and asking for a drawing directly is refused

### Requirement: Picking the animals
The system SHALL let the person pick two to six animals for the picture, each at most once, from the animals that person may pick as their own face: the ones offered to everyone, their school's own, the Ink ones when they have Ink, and the pets they had made. The admin SHALL be offered every animal. The pick SHALL NOT depend on who is in the group.

#### Scenario: A group with one member
- **WHEN** the only member of a group picks four animals
- **THEN** the four are accepted

#### Scenario: Too few or too many
- **WHEN** a person asks for a drawing of one animal, or of seven
- **THEN** it is refused with a sentence saying two to six are needed, and nothing is drawn

#### Scenario: An animal the person may not pick
- **WHEN** a person asks for a drawing that names another person's made pet, or an Ink animal without having Ink
- **THEN** it is refused and nothing is drawn

### Requirement: Two drawings, one kept
For each ask the system SHALL draw the picked animals together twice and show both drawings to the person. The person SHALL keep one; the other SHALL be let go and shown to nobody but the admin. The group's picture SHALL NOT change until a drawing is kept.

#### Scenario: Keeping one
- **WHEN** a person keeps the second of two drawings
- **THEN** the second is the group's picture, and the first is no longer shown to the person

#### Scenario: Leaving without keeping
- **WHEN** a person asks for drawings and leaves without keeping one
- **THEN** the group's picture is what it was before

#### Scenario: One drawing fails
- **WHEN** one of the two drawings cannot be made
- **THEN** the other is offered on its own and can be kept

#### Scenario: Both fail
- **WHEN** neither drawing can be made
- **THEN** the person is told to try again in a minute, and the ask does not count against their limit

#### Scenario: A newer picture
- **WHEN** a group that has a kept picture keeps a new one
- **THEN** the new one is the group's picture and the earlier one is let go

### Requirement: Where the picture shows
The system SHALL show a group's kept picture in place of the Loop rings wherever the group is shown on the groups pages: the group's head, the groups list, the list of groups inside a group, and the top bar. Everyone who can open the group SHALL see it. A group with no picture SHALL show what it showed before.

#### Scenario: Another member looks
- **WHEN** a member opens a group whose organizer kept a picture
- **THEN** the member sees that picture on the group's head and in their groups list

#### Scenario: A group with none
- **WHEN** a group has no kept picture
- **THEN** it shows the Loop rings

### Requirement: Drawing is part of Ink+
The system SHALL ask a person who is not the admin to subscribe to Ink+ before their first drawing: an email is taken and kept, nothing is charged, and the person is told so. A person who has asked SHALL NOT be asked again. The admin SHALL never be asked.

#### Scenario: The first time
- **WHEN** an organizer who has not asked for Ink+ opens "Group picture"
- **THEN** they see the Ink+ plan with its price and Subscribe, and no animals to pick

#### Scenario: After subscribing
- **WHEN** that organizer subscribes with an email
- **THEN** the email is kept, they are told payment is not set up and this is free, and the animals to pick are shown

#### Scenario: The admin
- **WHEN** the admin opens "Group picture"
- **THEN** the animals to pick are shown at once

### Requirement: A limit while nothing is charged
The system SHALL let a person who is not the admin ask for drawings three times in all, and SHALL refuse a fourth with a sentence saying so. The admin SHALL have no limit.

#### Scenario: The fourth ask
- **WHEN** a person who has asked three times asks again
- **THEN** it is refused, nothing is drawn, and the group's picture stays

### Requirement: The free picture of members' faces
A group with no kept drawing SHALL show, in place of the Loop rings, up to four of its members' faces set close together. A group with one member SHALL show the Loop rings.

#### Scenario: Four members, no drawing
- **WHEN** a group of four has no kept drawing
- **THEN** its tile shows the four members' faces

#### Scenario: A drawing is kept
- **WHEN** that group keeps a drawing
- **THEN** its tile shows the drawing
