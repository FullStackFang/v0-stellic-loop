# Spec Delta

## Purpose

Turns the pool of people who said they would go if they had a crew into small persistent crews, by an explicit organizer action and one deterministic packing rule.

## ADDED Requirements

### Requirement: Formation is organizer-triggered
Crews SHALL form only when the loop's organizer triggers "Form crews" and confirms the preview. The system SHALL never form crews automatically.

#### Scenario: Organizer forms crews
- **WHEN** the organizer presses "Form crews" on a loop with eligible members
- **THEN** a preview of placements is shown and nothing is saved or emailed until the organizer confirms

### Requirement: Eligibility
The system SHALL treat a member as eligible for placement only if their intent is `crew_conditional` or `going_want_crew`, they have not left the loop, and they are not already in a crew of that loop.

#### Scenario: Watching member is skipped
- **WHEN** formation runs with a `watching` member in the loop
- **THEN** that member is not placed in any crew

#### Scenario: Crewed member is stable
- **WHEN** formation runs again after a member was placed last week
- **THEN** that member remains in the same crew

### Requirement: Packing order
The system SHALL order the eligible pool as all `going_want_crew` members by tap-in time (oldest first), then all `crew_conditional` members by tap-in time (oldest first), ties broken by membership id. Formation SHALL then run step 1 (fill existing crews) and step 2 (form new crews) in that order.

#### Scenario: Order is by intent then tap-in
- **WHEN** A (`crew_conditional`, 9:00), B (`going_want_crew`, 9:30), C (`crew_conditional`, 9:10) are eligible
- **THEN** the pool order is B, A, C

### Requirement: Step 1 fills existing crews to five
Taking pool members in order, the system SHALL add each to the oldest existing crew (by formation time, then crew id) that has fewer than 5 active members, until no such crew remains or the pool is empty. A crew of 5 or 6 SHALL receive nobody.

#### Scenario: Latecomer joins a running crew
- **WHEN** a crew of 4 exists and one new `crew_conditional` member is eligible
- **THEN** that member is added to the existing crew and no new crew forms

#### Scenario: Crew of four absorbs at most one
- **WHEN** a crew of 4 exists and three members are eligible
- **THEN** the crew receives exactly one member and the other two go to step 2

#### Scenario: Two crews with space
- **WHEN** crew X (formed first, 4 members) and crew Y (4 members) exist and three members are eligible
- **THEN** X receives the first pool member, Y receives the second, and the third goes to step 2

### Requirement: Step 2 forms new crews by even packing
With n members remaining after step 1, the system SHALL form k = floor(n / 4) new crews when n ≥ 4, sizes as even as possible with no crew above 6, assigning remaining members in pool order round-robin across the k crews. Members beyond 6k SHALL stay in the waiting pool. When n < 4, no crew forms.

#### Scenario: Seven remain
- **WHEN** seven members remain after step 1
- **THEN** exactly one crew of 6 forms and one member waits

#### Scenario: Nine remain
- **WHEN** nine members remain
- **THEN** two crews form, of 5 and 4 members, and nobody waits

#### Scenario: Thirteen remain
- **WHEN** thirteen members remain
- **THEN** three crews form, of 5, 4, and 4 members, and nobody waits

#### Scenario: Three remain
- **WHEN** three members remain and no existing crew has space
- **THEN** no crew forms and all three wait

#### Scenario: Six committed, no conditional
- **WHEN** six `going_want_crew` members and no `crew_conditional` members are eligible
- **THEN** one crew of 6 forms

### Requirement: Anchored flag
A crew SHALL be flagged anchored when it contains at least one member whose intent was `going_want_crew` at the moment they were placed. The flag SHALL become true when such a member fills an existing crew and SHALL never revert to false.

#### Scenario: One committed plus three conditional
- **WHEN** one `going_want_crew` and three `crew_conditional` members are eligible and no crews exist
- **THEN** one anchored crew of four forms containing all of them

#### Scenario: Round-robin spreads anchors
- **WHEN** two `going_want_crew` and six `crew_conditional` members remain
- **THEN** two crews of 4 form and each contains one `going_want_crew` member, so both are anchored

#### Scenario: Committed latecomer fills an unanchored crew
- **WHEN** an unanchored crew of 4 exists and a `going_want_crew` member is eligible
- **THEN** that member joins the crew and the crew becomes anchored

### Requirement: Formation is deterministic
Given the same loop state, formation SHALL produce the same placements.

#### Scenario: Repeat on unchanged state
- **WHEN** formation runs twice with no membership changes between runs
- **THEN** the second run makes no changes

### Requirement: Confirm applies to the previewed state only
On confirm, the system SHALL verify that the eligible pool and existing crews are unchanged since the preview and SHALL abort without saving if they changed.

#### Scenario: Tap-in between preview and confirm
- **WHEN** a new member taps in after the organizer saw the preview and before they confirm
- **THEN** nothing is saved and the organizer is shown a fresh preview

### Requirement: Placement is recorded with a time
When a member is placed, the system SHALL record the placement time on their membership. Attendance denominators SHALL start from that time.

#### Scenario: Placement time
- **WHEN** a member is placed on Monday
- **THEN** their membership records that Monday timestamp as the time they were crewed

### Requirement: Members are told when placed
After a confirmed formation, each newly placed member SHALL receive one email with the crew's next meeting and a link to their member page. Members left waiting SHALL receive nothing.

#### Scenario: Placement email
- **WHEN** formation places a member for the first time
- **THEN** that member receives one email containing the crew's next meeting and a link to their member page
