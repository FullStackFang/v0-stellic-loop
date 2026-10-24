# Spec Delta

## Purpose

Quorum, idling and reopen work the same on a rolling board as on the trip board, with the window defined by `board-window`.

## MODIFIED Requirements

### Requirement: Quorum is the poster's number or four
A proposal's minimum SHALL be its `min_count` if set, otherwise 4. A needs-a-day proposal SHALL be ready when the best day's heat reaches the minimum; a no-day proposal SHALL be ready when the count of `in` reaches it. The best day SHALL be the window day, today or later in the board's timezone, with the highest heat, earliest day winning ties. A proposal's deadline limits when it can be locked, not which day it locks to: the best day can fall after the deadline.

#### Scenario: Ready by overlap
- **WHEN** minimum is 4 and heat is Mon 3, Tue 4, Wed 4
- **THEN** the proposal is ready and the best day is Tue

#### Scenario: Ready by count
- **WHEN** a no-day proposal with no number has 4 in
- **THEN** it is ready

#### Scenario: Past day is not best
- **WHEN** today is Wed, minimum is 4, and heat is Mon 5, Thu 4
- **THEN** the proposal is ready and the best day is Thu

#### Scenario: Best day after the deadline
- **WHEN** "Case prep" was posted on a rolling board on Nov 3 2026 (deadline Nov 16) and on Nov 10 four people in are free Fri Nov 20
- **THEN** it is ready, the ask names Fri 20, and locking sets the day to Nov 20

### Requirement: Deadlines, idling, past and closing
A proposal with a deadline SHALL idle at the end of that day in the board's timezone if still open. On a fixed board, a needs-a-day proposal with no deadline SHALL idle at the end of the board window. On a rolling board, posting a needs-a-day proposal SHALL set its deadline to the last day of the window it was posted into (posted day plus 13), so it idles like any proposal with a deadline. A no-day proposal with no deadline SHALL stay open on any board. Idling SHALL be computed at read time, the `proposal_idled` event SHALL be written once by the daily job, and no notification SHALL ever be sent on idle. An ON proposal with a day SHALL be past after that day; the poster SHALL be able to close any of their proposals, which shows as past, is distinct from idled, and cannot be reopened.

#### Scenario: Idle at window end
- **WHEN** the board window ends and "Boat" is still open with 3 of 6
- **THEN** the board shows "Boat" under past and idled as "didn't reach 6" and exactly one `proposal_idled` event exists after the daily job

#### Scenario: Open forever
- **WHEN** "Cohort shirts" has no day and no deadline
- **THEN** it never idles

#### Scenario: Rolling board implied deadline
- **WHEN** "Room after class Thu" is posted on a rolling board on Tue Nov 3 2026 and is still open with 2 of 4 at the end of Mon Nov 16 2026
- **THEN** its deadline is Nov 16 2026 and it shows as idled from Nov 17

### Requirement: Reopen at a lower number
The poster SHALL be able to reopen an idled proposal in one tap. On a fixed board the reopen SHALL take a lower minimum; on a rolling board it SHALL take the same or a lower minimum, since a new two weeks is a fresh chance. Reopening SHALL set the minimum, set the deadline to the end of the board's current window (the fixed window's end, or today plus 13 on a rolling board), write `proposal_reopened`, and send nothing. On a fixed board whose window is over, reopening SHALL be refused.

#### Scenario: Reopen
- **WHEN** the poster reopens "Boat" at 4
- **THEN** it is open with minimum 4, existing answers kept, and no notifier call is made

#### Scenario: Reopen on a rolling board
- **WHEN** Marcus posted "Case prep Sunday" (minimum 4) on a rolling board, it idled, and he reopens it at 4 on Fri Nov 20 2026
- **THEN** it is open with minimum 4 and deadline Dec 3 2026, and no notifier call is made
