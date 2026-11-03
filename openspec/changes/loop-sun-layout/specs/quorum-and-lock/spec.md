## MODIFIED Requirements

### Requirement: Quorum is the poster's number or four
A proposal's threshold SHALL be its `min_count` if set (legacy rows only), otherwise 4. A proposal with a slot or no day SHALL form when the count of `in` reaches the threshold. A legacy needs-a-day proposal SHALL form when the best day's heat reaches the threshold; the best day SHALL be the window day, today or later in the board's timezone, with the highest heat, earliest day winning ties.

#### Scenario: Forms by count
- **WHEN** a slotted proposal with no number reaches 4 in
- **THEN** it forms

#### Scenario: Legacy forms by overlap
- **WHEN** a legacy needs-a-day proposal with threshold 4 has heat Mon 3, Tue 4
- **THEN** it forms on Tue

### Requirement: Anyone in can lock; ON is a latch
Formation SHALL happen on the server inside the response action: when recording an `in` brings the count to the threshold, the server SHALL call `lock_proposal` for that person. `lock_proposal` SHALL set `status=on`, the day (the slot day, the best day for legacy rows, or none), `on_at` and `locked_by`, and SHALL write exactly one `threshold_reached` event, in one transaction. A second call SHALL have no effect and report "already on". Formed SHALL never revert, even if yeses drop below the threshold. No page SHALL offer a lock action.

#### Scenario: Concurrent fourth taps
- **WHEN** two people tap I'm in within the same second on a plan at 3 of 4
- **THEN** one `threshold_reached` event exists and both see the plan formed with 5 of 4

#### Scenario: Drops after formation
- **WHEN** a formed plan with threshold 4 falls to 3 in
- **THEN** it stays formed and the row reads "3" over "in · join"

### Requirement: Locking hands off to the notifier once
On formation, the system SHALL call the notifier's `onReached` exactly once with everyone `in` and, for legacy needs-a-day rows, the `in` people whose days did not include the day. No `maybe` list SHALL be passed.

#### Scenario: Hand-off
- **WHEN** "Overnight boat" forms at 4 in
- **THEN** one `onReached` call is made with 4 yeses and the lead on the page reads "Formed. One message went to all 4."

### Requirement: Deadlines, idling, past and closing
A proposal with a deadline SHALL idle at the end of that day in the board's timezone if still open. A slotted proposal SHALL take a deadline of its day, or of posting day plus 13 when it has no day; a legacy needs-a-day proposal keeps its rules. Idling SHALL be computed at read time, the `proposal_idled` event SHALL be written once by the daily job, and no notification SHALL ever be sent on idle. An idled proposal SHALL render as "Didn't form · <n> of <threshold>" on its page and in Wrapped up. A formed proposal with a day SHALL be past after that day. The poster SHALL be able to close any of their open proposals, which shows under Wrapped up as "closed", is distinct from didn't form, and cannot be reopened.

#### Scenario: Didn't form
- **WHEN** "Wine night" for Thu 12 Feb is still open at 2 of 4 at the end of that day
- **THEN** its page reads "Didn't form · 2 of 4", it appears under Wrapped up as "didn't form · 2 of 4", and exactly one `proposal_idled` event exists after the daily job

## REMOVED Requirements

### Requirement: The ask appears at quorum
**Reason**: The spec has no host; formation is automatic at the threshold, so there is nothing to ask.
**Migration**: `components/Ask.tsx`, the `lock` action and the "Not yet" dismissal are deleted; the fourth I'm in forms the plan.

### Requirement: Reopen at a lower number
**Reason**: Visible failure is the point; a didn't-form plan stays as it ended. A fresh attempt is a new plan.
**Migration**: "Post it again" on the didn't-form page opens the post form prefilled and records `version_of`. `proposal_reopened` is no longer written.
