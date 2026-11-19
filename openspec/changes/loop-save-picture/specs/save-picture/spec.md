## ADDED Requirements

### Requirement: Saving a picture is free and carries the Loop mark
The system SHALL let a signed-in person save their own picture as a PNG file at no cost. A picture saved by a person without Ink+ SHALL carry the Loop mark.

#### Scenario: A person without Ink+ saves
- **WHEN** a person without Ink+ saves their picture as a profile picture
- **THEN** they receive a 1080 by 1080 PNG of their animal on the chosen colour, with the Loop mark on it

#### Scenario: Not signed in
- **WHEN** someone who is not signed in asks for a saved picture
- **THEN** nothing is given

### Requirement: Three shapes
The system SHALL offer three shapes: a profile picture, 1080 by 1080, with the mark placed inside the round a profile picture is cut to; a lock screen, 1080 by 1920, with the person's name, their school and the mark, and its top third left empty; and a sticker, 512 by 512, with no ground, a white edge round the figure and the mark as a tag at its corner.

#### Scenario: Lock screen
- **WHEN** a person at Cornell saves the lock screen
- **THEN** the file is 1080 by 1920 and shows their animal, their name, "Cornell" and the Loop mark

#### Scenario: Sticker
- **WHEN** a person saves the sticker
- **THEN** the file is 512 by 512 with a transparent ground

### Requirement: Ground colours
The system SHALL offer five ground colours for the profile picture and the lock screen, the person's school colour first, and SHALL offer none for the sticker.

#### Scenario: Another colour
- **WHEN** a person picks the cream ground and saves
- **THEN** the file's ground is cream, and the mark and the words are in a colour that reads on it

### Requirement: Taking the mark off is Ink+
The system SHALL give a picture without the Loop mark only to a person who has Ink+ or is the admin, and SHALL decide this on the server. A person without Ink+ who asks for no mark SHALL be shown the Ink+ plan; subscribing takes an email, charges nothing, says so, and then gives the picture without the mark.

#### Scenario: Asking for no mark without Ink+
- **WHEN** a person without Ink+ presses "No mark"
- **THEN** they see the Ink+ plan with its price and Subscribe, and no file is given

#### Scenario: After subscribing
- **WHEN** that person subscribes with an email and saves with "No mark"
- **THEN** the file has no Loop mark and the figure sits in the middle

#### Scenario: Asking the server directly
- **WHEN** a person without Ink+ asks the server for a picture without the mark
- **THEN** it is refused

### Requirement: Every animal can be saved, from the largest picture Loop has
The system SHALL keep the large drawing of every animal made from this change on, and SHALL save a picture from its large drawing when there is one. A picture Loop has only small (an animal shipped with the app, or a pet made before this change) SHALL still be saved, made larger. A person who wears their own photo has no animal to save, and the pane SHALL say so.

#### Scenario: A pet made after this change
- **WHEN** a person has a pet drawn and saves it
- **THEN** the file is made from the large drawing

#### Scenario: An animal Loop has only small
- **WHEN** a person wearing one of the animals shipped with the app saves their picture
- **THEN** they receive the file, with the animal made larger

#### Scenario: Wearing their own photo
- **WHEN** a person whose picture is the photo of their sign-in account opens "Save your picture"
- **THEN** no file is offered, and the pane says to pick an animal

### Requirement: A group's picture
The system SHALL let any member of a group save the group's drawn picture in the same three shapes, under the same rule for the mark, with the group's name where a person's name would be.

#### Scenario: A member saves the group's picture
- **WHEN** a member of a group with a drawn picture saves its lock screen
- **THEN** the file shows the group's picture, the group's name and the Loop mark

#### Scenario: Not a member
- **WHEN** a person who cannot open the group asks for its saved picture
- **THEN** it is refused
