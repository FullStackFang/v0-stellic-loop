## ADDED Requirements

### Requirement: Per-member share flag, off by default
Each membership (`board_person`) SHALL carry `share_with_steward`, default false. A person SHALL be able to turn it on or off at any time from their plans page, and the change SHALL take effect immediately with no confirmation step and no notification.

#### Scenario: Default
- **WHEN** a person joins a space by tapping I'm in
- **THEN** their membership has `share_with_steward = false`

#### Scenario: Toggle on
- **WHEN** a member switches the control on
- **THEN** their membership row reads true and the switch shows on when the page reloads

### Requirement: The copy says exactly what is shared
The control SHALL be a box with a switch and this copy, unchanged: title "Let the <steward org> see whether you're in a standing crew", body "They see yes or no, and how many weeks. Not which crew, not who with, not anything you post.", footnote "Off by default. Change it any time." The steward org name SHALL be the space's configured steward label, "the EMBA office" for the cohort space. The copy SHALL NOT be softened, shortened or placed behind a fold.

#### Scenario: Cohort copy
- **WHEN** the EMBA 2027 member opens their plans page
- **THEN** the box reads "Let the EMBA office see whether you're in a standing crew" with the body and footnote verbatim

### Requirement: Nothing reads the flag yet
Until a steward page exists, no page SHALL display any member's flag to anyone but that member, and the flag SHALL NOT change what any other member sees.

#### Scenario: No leak
- **WHEN** a member has the flag on
- **THEN** no other page in the app shows their name, flag or any per-person count because of it
