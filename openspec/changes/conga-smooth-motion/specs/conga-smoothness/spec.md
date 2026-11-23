## ADDED Requirements

### Requirement: Smoothness is measured by a kept script
The repository SHALL hold a script that plays scripted Conga rounds in a browser and reports frame gaps, script time per frame, every stretch of script over 25 ms with what ran in it, and time spent collecting garbage.

#### Scenario: Measuring a change
- **WHEN** the script is run against the running app at 1920×1000 on the Columbia ground
- **THEN** it plays at least 60 seconds across at least three rounds without anyone at the keyboard and prints those four measures

### Requirement: Starting a round does not cost a frame
Pressing Start or Again once a card has been up for a second SHALL NOT run more than 25 ms of script in one stretch on the measuring machine.

#### Scenario: Again after a round
- **WHEN** a round has ended, its card has been up for a second, and Again is pressed
- **THEN** the stretch of script that starts the new round is under 25 ms

#### Scenario: Again pressed at once
- **WHEN** Again is pressed before the next world has finished being got ready
- **THEN** the round still starts, on a world as warmed as any other

### Requirement: Playing makes little garbage
During ordinary play at 1920×1000 on the Columbia ground, on the measuring machine, the game SHALL make under 8 MB of memory a second, as the middle of three runs of the measuring script. (Collector time follows from it but swings by a third between runs of one build, so it is reported and not marked.)

#### Scenario: A minute of play
- **WHEN** the measuring script is run three times
- **THEN** the middle figure for memory made is under 8 MB a second

#### Scenario: The rules are unchanged
- **WHEN** the rules' tests (`app/conga/sim.test.ts`) are run
- **THEN** they pass with no test changed

### Requirement: What is out of view is not worked out
The game SHALL NOT build per-animal drawing data for a line with no animal in view, and SHALL NOT draw a stop sign that is out of view.

#### Scenario: A line across the ground
- **WHEN** a line of 50 is wholly outside the view
- **THEN** no object is made for its animals that frame, and its name and rope are not drawn

#### Scenario: It comes into view
- **WHEN** that line's head or any of its animals comes into view
- **THEN** it is drawn whole as before

### Requirement: The page is written only when it changes
The game SHALL NOT build the scoreboard's rows while the scoreboard is closed, and SHALL NOT rewrite the scoreboard, the player's count or their place while what they show is unchanged.

#### Scenario: The scoreboard is closed
- **WHEN** the scoreboard is folded shut
- **THEN** its rows are not built or written

#### Scenario: Open and unchanged
- **WHEN** the scoreboard is open and what it would show is what it shows
- **THEN** its elements are not replaced

#### Scenario: A line grows
- **WHEN** a line on the open scoreboard gathers an animal
- **THEN** the scoreboard shows the new count the next time it is looked over, every twelfth frame
