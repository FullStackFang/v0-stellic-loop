## MODIFIED Requirements

### Requirement: Top bar on one line
The top bar SHALL be one line holding the Loop mark, "This week", the person's groups by name, the Ink tab, "Post a plan" and the person's avatar with its level badge. A group SHALL be listed only for a person who is able to open it. The Ink tab SHALL be shown to everyone, signed in or not, SHALL be a pill, and SHALL open the Ink page. When a group reward is unlocked and not yet used, the bar SHALL also show it. The bar SHALL NOT hold a page title band or reward pills.

#### Scenario: Groups for someone who can open them
- **WHEN** the admin, who belongs to three groups, opens the screen
- **THEN** the top bar lists those three groups by name, each a link to its page

#### Scenario: Groups for someone who cannot
- **WHEN** a student who cannot open any group page opens the screen
- **THEN** the top bar lists no groups

#### Scenario: Reward unlocked
- **WHEN** a person's group reward has unlocked and has not been used
- **THEN** the top bar shows "Show at the counter" with the reward and the current time

#### Scenario: Signed out
- **WHEN** a signed-out visitor opens the screen
- **THEN** the top bar shows "Sign in" where the avatar would be

#### Scenario: The Ink tab
- **WHEN** anyone, signed in or not, opens the screen
- **THEN** the top bar shows a pill reading "Ink" with the Ink mark, and pressing it opens the Ink page

#### Scenario: The Ink tab on a narrow screen
- **WHEN** the screen is narrower than 520px
- **THEN** the tab shows the Ink mark alone and is still named "Ink" to a screen reader
