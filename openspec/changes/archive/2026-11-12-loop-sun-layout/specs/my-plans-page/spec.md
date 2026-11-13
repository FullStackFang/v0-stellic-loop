## ADDED Requirements

### Requirement: Your plans, nothing else
`/b/<slug>/you` SHALL require a session; without one it SHALL show the space name and a single line asking the person to open a plan and tap I'm in. With a session it SHALL show the header (wordmark to the space, space chip to the space), the tag "Your week · <today>", the title "Your week", a sub line "<a> crews · <b> forming · <c> you posted", and three sections of lit rows per `board-page`: "This week" (formed plans the viewer is in, soonest first, status line "You said yes"), "Forming" (open plans the viewer is in, status line "<k> more and it forms"), and "You posted" (the viewer's open or didn't-form posts, status line "<d> days left, then it closes" or "didn't form · <n> of <m>"). An empty section SHALL be omitted. No free-days strip, no headline other than "Your week", no plans the viewer is not part of.

#### Scenario: Three lists
- **WHEN** Priya is in on a formed Thursday run and an open Overnight boat and posted Dim sum Sunday
- **THEN** her page shows Thursday run under This week, Overnight boat under Forming with "One more and it forms", and Dim sum Sunday under You posted with "9 days left, then it closes"

#### Scenario: Signed out
- **WHEN** a visitor with no cookie opens `/b/emba27/you`
- **THEN** the page shows "EMBA 2027" and "Open a plan link and tap I'm in to see your plans here", and no rows

### Requirement: The opt-in box sits last
Below the lists the page SHALL show the steward opt-in control from `steward-opt-in`, then the name switch from `board-identity`, and nothing after them.

#### Scenario: Order
- **WHEN** the page renders with rows
- **THEN** the opt-in box follows the last row and the name switch follows the opt-in box
