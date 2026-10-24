# intent-response Specification

## Purpose
TBD - created by archiving change quorum-board. Update Purpose after archive.
## Requirements
### Requirement: One answer per person per proposal
A person SHALL hold at most one answer (`in`, `maybe`, `out`) per proposal and SHALL be able to change it at any time, including after ON. Every change SHALL write a `response` event carrying the new and previous answer and the source. Tapping the current answer again SHALL clear it.

#### Scenario: Change of mind
- **WHEN** Priya changes from `maybe` to `in`
- **THEN** one response row shows `in` and a `response` event records `maybe` → `in`

#### Scenario: Tap again
- **WHEN** Priya taps "In" while already in
- **THEN** her response is removed and the count drops by one

### Requirement: Maybe never counts
Only `in` answers SHALL count toward the minimum and toward day heat. `maybe` answers SHALL be shown as a separate count on the card and listed on the page.

#### Scenario: Maybes do not lift a proposal
- **WHEN** a proposal with minimum 4 has 3 in and 5 maybe
- **THEN** the proposal is not ready and the card reads "3 in · 5 maybe"

### Requirement: The poster is in
Posting SHALL create the poster's `in` answer. The poster SHALL be able to change it like anyone else.

#### Scenario: Poster drops
- **WHEN** the poster changes their answer to `out`
- **THEN** the count excludes them and the proposal still exists with them as poster

### Requirement: Names are visible to anyone with the link
The proposal page SHALL list the names of people who are in and, separately, maybe, to anyone who opens it, honouring each person's name switch. Day heat SHALL show counts only.

#### Scenario: Who's in
- **WHEN** a person opens a proposal with Priya and Marcus in and Hana maybe
- **THEN** the page lists Priya and Marcus under In and Hana under Maybe, and the heat cells show numbers without names

### Requirement: Answers after ON are counted
After a proposal is ON, new `in` answers SHALL be counted and shown; a drop by someone who was in SHALL reduce the count, write a `response` event, and hand the notifier a `dropped` message for the poster only.

#### Scenario: Drop after ON
- **WHEN** Marcus changes from `in` to `out` on an ON proposal with 8 in
- **THEN** the card reads "7 in · On" and the notifier receives one `dropped` message addressed to the poster

