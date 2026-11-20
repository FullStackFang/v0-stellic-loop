## ADDED Requirements

### Requirement: A drawing is a draft until it is kept
A drawing made from a pet photo SHALL be a draft until the person presses Keep it. A draft SHALL NOT be:
- listed among the person's animals, in any picker, or on the admin page;
- worn as anyone's face;
- counted against the person's animals.

The maker SHALL show the draft with two actions: Keep it, and Draw again.

#### Scenario: A first drawing
- **WHEN** a person on Ink with 3 left draws an animal from a photo
- **THEN** the maker shows the drawing with Keep it and Draw again, their face is unchanged, and they still have 3 left

#### Scenario: Keeping it
- **WHEN** they press Keep it
- **THEN** the animal is among their animals, it is their face, and they have 2 left

#### Scenario: The admin page does not list drafts
- **WHEN** a person has a draft and the admin opens the animals on `/c/admin`
- **THEN** the draft is not among them

### Requirement: Drawing again replaces the draft
A person SHALL have at most one draft. Draw again SHALL replace the draft with the new drawing, and the replaced draft SHALL be deleted.

#### Scenario: Three tries, one kept
- **WHEN** a person draws, presses Draw again twice, then Keep it
- **THEN** one animal is added to their animals, they have one fewer left, and no other drawing from those tries is stored

#### Scenario: Two tabs at once
- **WHEN** a person asks for a drawing while another of theirs is being drawn
- **THEN** the second is refused with the words "That one is already being drawn. Try in a minute."

### Requirement: A draft that is not kept is deleted
A draft SHALL be deleted, with its picture file, when:
- it is replaced by Draw again;
- the person presses Throw away or leaves the maker with Back;
- it is more than a day old.

A draft SHALL survive a refresh or a closed tab within that day, and the maker SHALL show it on return.

#### Scenario: Back out of the maker
- **WHEN** a person with a draft presses Back
- **THEN** the draft is deleted and no animal is added

#### Scenario: Coming back
- **WHEN** a person draws, closes the tab, and opens the maker again an hour later
- **THEN** the maker shows that drawing with Keep it and Draw again

#### Scenario: A day later
- **WHEN** a draft is more than a day old and anyone draws or keeps an animal
- **THEN** that draft and its picture file are deleted

### Requirement: Redrawing a kept animal swaps it on Keep
Drawing again an animal the person already kept SHALL make a draft beside it. Keep it SHALL replace the kept animal with the draft, delete the old one, and use none of the person's count. Anyone wearing the old one SHALL wear the new one.

#### Scenario: A redraw kept
- **WHEN** a person on Ink with 1 left redraws an animal they kept and presses Keep it
- **THEN** the new drawing takes the old one's place, the old one is deleted, and they still have 1 left

#### Scenario: A redraw not kept
- **WHEN** they press Back instead
- **THEN** the old animal is unchanged and the draft is deleted

### Requirement: The count is shown where an animal is made
The "Create your own" tile in the picker SHALL carry a badge:
- on Ink, the number of animals left (3, 2, 1, or 0);
- on Ink+, and for the admin, the Ink+ mark in place of a number;
- on Loopd (free), no badge.

The maker SHALL say the same. The count SHALL drop only when a new animal is kept.

#### Scenario: Ink with two kept
- **WHEN** a person on Ink who has kept two animals opens the picker
- **THEN** the "Create your own" tile's badge reads 1, and its accessible name says "1 left"

#### Scenario: Ink at none left
- **WHEN** a person on Ink who has kept three animals presses the tile
- **THEN** the badge reads 0 and the tile opens the Ink+ offer at $9.99 a month

#### Scenario: Ink+
- **WHEN** a person on Ink+ opens the picker
- **THEN** the tile's badge is the Ink+ mark and shows no number, and its accessible name says "no limit"

#### Scenario: Drafts use nothing
- **WHEN** a person on Ink with 2 left draws and presses Draw again twice without keeping
- **THEN** the badge still reads 2
