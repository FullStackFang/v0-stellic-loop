# Spec Delta

## Purpose

The threshold is the mechanism: the board prompts when enough people overlap, anyone in can lock, and ON happens exactly once.

## ADDED Requirements

### Requirement: Quorum is the poster's number or four
A proposal's minimum SHALL be its `min_count` if set, otherwise 4. A needs-a-day proposal SHALL be ready when the best day's heat reaches the minimum; a no-day proposal SHALL be ready when the count of `in` reaches it. The best day SHALL be the window day with the highest heat, earliest day winning ties.

#### Scenario: Ready by overlap
- **WHEN** minimum is 4 and heat is Mon 3, Tue 4, Wed 4
- **THEN** the proposal is ready and the best day is Tue

#### Scenario: Ready by count
- **WHEN** a no-day proposal with no number has 4 in
- **THEN** it is ready

### Requirement: The ask appears at quorum
When ready, the proposal page and card SHALL show the ask: "N of M can do <Day>. Lock it in?" for needs-a-day, or "N of you want this. Make it happen?" for no-day, with a "Lock it in" / "It's on" action and a "Not yet" reply that dismisses the ask for that viewer without changing state.

#### Scenario: Not yet
- **WHEN** a person taps "Not yet"
- **THEN** the ask disappears for them and the proposal remains ready

### Requirement: Anyone in can lock; ON is a latch
Locking SHALL be allowed only for a person whose answer is `in` and only while ready. Locking SHALL set `status=on`, the locked day (best day, or none), `on_at` and `locked_by`, and SHALL write exactly one `threshold_reached` event, in one transaction. A second lock attempt SHALL have no effect and report "already on". ON SHALL never revert, even if yeses drop below the minimum.

#### Scenario: Concurrent locks
- **WHEN** two people tap "Lock it in" within the same second
- **THEN** one `threshold_reached` event exists, one `locked_by`, and both see the proposal ON

#### Scenario: Not in
- **WHEN** a person who is `maybe` requests a lock
- **THEN** the request is refused and nothing changes

#### Scenario: Drops after ON
- **WHEN** an ON proposal with minimum 8 falls to 7 in
- **THEN** it stays ON and the card reads "7 in · On"

### Requirement: Locking hands off to the notifier once
On a successful lock, the system SHALL call the notifier's `onReached` exactly once with: everyone `in`, everyone `maybe`, and the `in` people whose days did not include the locked day. In this change the notifier SHALL log the message and write a `text_sent` event with channel `log`.

#### Scenario: Hand-off
- **WHEN** "Suits" locks to Tue 16 with 8 in, of whom 2 cannot do Tue, and 1 maybe
- **THEN** one `onReached` call is made with 8 yeses, 2 can't-make-it, 1 maybe

### Requirement: Calendar invite for ON with a day
For a proposal that is ON with a locked day, `/p/<id>/invite.ics` SHALL return one all-day event on that day whose summary is the title and whose description carries the time text, cost and the proposal URL. For any other proposal it SHALL return not found.

#### Scenario: Download invite
- **WHEN** a person opens the invite URL of "Suits" locked to Feb 16 2027
- **THEN** a valid iCalendar document with one all-day event on 2027-02-16 is returned

### Requirement: Deadlines, idling, past and closing
A proposal with a deadline SHALL idle at the end of that day in the board's timezone if still open; a needs-a-day proposal with no deadline SHALL idle at the end of the board window; a no-day proposal with no deadline SHALL stay open. Idling SHALL be computed at read time, the `proposal_idled` event SHALL be written once by the daily job, and no notification SHALL ever be sent on idle. An ON proposal with a day SHALL be past after that day; the poster SHALL be able to close any of their proposals, which shows as past, is distinct from idled, and cannot be reopened.

#### Scenario: Idle at window end
- **WHEN** the board window ends and "Boat" is still open with 3 of 6
- **THEN** the board shows "Boat" under past and idled as "didn't reach 6" and exactly one `proposal_idled` event exists after the daily job

#### Scenario: Open forever
- **WHEN** "Cohort shirts" has no day and no deadline
- **THEN** it never idles

### Requirement: Reopen at a lower number
The poster SHALL be able to reopen an idled proposal with a lower minimum in one tap. Reopening SHALL set the new minimum, clear the deadline to the board window end, write `proposal_reopened`, and send nothing.

#### Scenario: Reopen
- **WHEN** the poster reopens "Boat" at 4
- **THEN** it is open with minimum 4, existing answers kept, and no notifier call is made
