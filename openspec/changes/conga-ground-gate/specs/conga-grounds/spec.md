## ADDED Requirements

### Requirement: A player's own schools' grounds are theirs
A signed-in player SHALL be able to play every ground of every school they belong to, without a paid plan.

#### Scenario: A Cornell player
- **WHEN** a signed-in player whose school is Cornell, without Ink+, opens the place picker
- **THEN** Cornell's hill and Cornell Tech can be chosen and played

#### Scenario: Two schools
- **WHEN** a player belongs to Cornell and Columbia
- **THEN** the grounds of both can be chosen and played

### Requirement: Another school's ground takes Ink+
A player without Ink+ SHALL NOT be able to start a round on a ground of a school they do not belong to, other than the open ground.

#### Scenario: A Cornell player presses Columbia's ground
- **WHEN** a signed-in Cornell player without Ink+ presses Morningside
- **THEN** no round starts there and the Ink+ ask is shown, naming Morningside

#### Scenario: Ink+
- **WHEN** a player has Ink+, or is an admin
- **THEN** every ground can be chosen and played

### Requirement: The open ground is open to everyone
One ground, the open ground (Cornell's hill), SHALL be playable by everyone: signed out, signed in with no school that has a ground, and signed in at any school. Someone with no ground of their own and no Ink+ SHALL be able to play no other.

#### Scenario: Signed out
- **WHEN** someone signed out opens Conga
- **THEN** the open ground is the one on the ticket, it can be played, and every other ground is locked

#### Scenario: Signed in, school without a ground
- **WHEN** a signed-in player whose only school has no ground, without Ink+, opens the place picker
- **THEN** the open ground can be played and every other ground is locked

#### Scenario: A player of another school
- **WHEN** a signed-in Columbia player without Ink+ opens the place picker
- **THEN** Morningside and the open ground can be played, and the rest are locked

#### Scenario: Signing in takes nothing away
- **WHEN** someone who played the open ground signed out then signs in
- **THEN** they can still play the open ground

### Requirement: A locked ground is shown and says the way in
A ground a player may not play SHALL be shown in the picker as locked, never left out, and pressing it SHALL say how to get it.

#### Scenario: Signed out presses a locked ground
- **WHEN** someone signed out presses Columbia's ground
- **THEN** a card says it is Columbia's, offers signing in first and Ink+ second, and no round starts there

#### Scenario: Signed in presses a locked ground
- **WHEN** a signed-in player without Ink+ presses another school's ground
- **THEN** the Ink+ ask is shown, naming that ground, and no round starts there

#### Scenario: Joining Ink+ from a locked ground
- **WHEN** a player joins Ink+ from the card of a locked ground
- **THEN** the way back from joining names that ground

### Requirement: A ground asked for that may not be played is not opened
When the address or the browser's kept choice names a ground the player may not play, the game SHALL open a ground they may play instead.

#### Scenario: A stranger follows a link to another ground
- **WHEN** someone signed out opens `/conga?map=columbia`
- **THEN** the open ground is the one opened, and the picker shows Columbia locked with its card

#### Scenario: A kept choice from before
- **WHEN** a stranger's browser kept `columbia` as their ground from an earlier visit
- **THEN** the open ground is opened

#### Scenario: A player follows a link to their own ground
- **WHEN** a signed-in Columbia player opens `/conga?map=columbia`
- **THEN** Morningside is opened

### Requirement: A board keeps only rounds on grounds the player may play
The server SHALL keep a round on a board only when its player is signed in and may play that ground, by the same rule the game uses.

#### Scenario: A round sent for a locked ground
- **WHEN** a signed-in Cornell player without Ink+ sends a round on Morningside
- **THEN** it is refused and no board changes

#### Scenario: Anyone signed in on the open ground
- **WHEN** a signed-in player of any school, or of none with a ground, sends a round on the open ground
- **THEN** it is kept on that ground's board

#### Scenario: Played signed out, then signed in
- **WHEN** someone plays the open ground signed out, presses "Sign in to go on the board" and signs in
- **THEN** that round is kept on the open ground's board

#### Scenario: A ground that does not exist
- **WHEN** a round names a ground that is not one of the game's
- **THEN** it is refused

### Requirement: The game and the server use one rule
Who may play which ground SHALL be decided by one function that both the game and the server call.

#### Scenario: The rule changes
- **WHEN** the open ground is changed to another ground
- **THEN** the picker and the board both follow from that one change
