## ADDED Requirements

### Requirement: The kept ground looks like the ground painted whole
The ground laid from kept squares SHALL show no break, gap or repeat where two squares meet, on either ground and at any screen size.

#### Scenario: The far bank's stitch on a laptop
- **WHEN** the Roosevelt Island ground is shown at 1440×900 with the Manhattan or Queens bank in view
- **THEN** the running stitch along the bank's shore runs unbroken across every join between squares

#### Scenario: Walking across the ground
- **WHEN** a line walks from one end of either ground to the other
- **THEN** no seam, missing square or cut-off name is seen

### Requirement: The kept ground holds a bounded amount of memory
The game SHALL keep no more squares of ground than about twice those in view, and SHALL give a dropped square's memory back when it drops it.

#### Scenario: A phone after a long game
- **WHEN** a game has been played on a phone-size screen across the whole ground
- **THEN** the squares kept number no more than twice those in view, and at least 40 may be kept

#### Scenario: A large screen
- **WHEN** the game is shown at 2560×1440 at full sharpness
- **THEN** squares left more than two squares outside the view are let go

### Requirement: The game carries on when a square cannot be made
The game SHALL keep drawing and keep running when the browser refuses a new canvas for a square of ground.

#### Scenario: The browser is out of canvas memory
- **WHEN** a square's canvas gives no drawing context
- **THEN** the kept squares are dropped, that frame's ground is painted directly, and the next frame is still asked for

### Requirement: New ground coming into view does not cost a frame
The game SHALL lose no frame to painting new squares of ground while a line walks or dashes, at 60 frames a second on the measuring machine.

#### Scenario: Dashing across a large screen
- **WHEN** a line dashes for ten seconds at 1920×1080 and at 2560×1440, full sharpness
- **THEN** no gap between frames is longer than 25 ms

### Requirement: A rope is drawn only where it is seen
The game SHALL stroke only the parts of a line's rope that are on screen, and the rope SHALL look as it did when stroked whole.

#### Scenario: A long line mostly off screen
- **WHEN** a line of 100 animals has ten of them on screen
- **THEN** only the rope through those ten and their neighbours is stroked

#### Scenario: The look is unchanged
- **WHEN** the frozen measuring scene is drawn before and after
- **THEN** the ropes on screen are the same in colour, width, twist and shadow

### Requirement: A paused game does not repaint
While paused, the game SHALL NOT repaint the picture, except once after something it shows has changed.

#### Scenario: Paused and left alone
- **WHEN** the game is paused and nothing else happens
- **THEN** the canvas is not drawn to on the frames that follow

#### Scenario: The window is resized while paused
- **WHEN** the window's size changes during a pause
- **THEN** the picture is drawn once at the new size

#### Scenario: A pause does not blur the picture
- **WHEN** a game is paused for a minute and resumed
- **THEN** the sharpness is what it was before the pause
