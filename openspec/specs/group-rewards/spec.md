# group-rewards Specification

## Purpose
TBD - created by archiving change loop-campus-rewards. Update Purpose after archive.
## Requirements
### Requirement: Group reward on an event
A group reward SHALL name who gives it, a head count of two or more, and what the group gets. It SHALL ride on one event or on every event with a given host name. It SHALL unlock for an outing when the number of that outing's people who have checked in reaches the head count, and SHALL then show for every person checked in on that outing. Check-ins on different outings SHALL NOT add up.

#### Scenario: Third person checks in
- **WHEN** a reward needs three and the third member of an outing checks in
- **THEN** the reward shows as unlocked for all three

#### Scenario: Enough in, not yet checked in
- **WHEN** a reward needs three, three are in the outing and none has checked in
- **THEN** the ticket says enough are in and that it unlocks when three check in

#### Scenario: Two separate groups
- **WHEN** two outings on the same event each have two people checked in and the reward needs three
- **THEN** neither outing's reward is unlocked

#### Scenario: In but not checked in
- **WHEN** a reward has unlocked for an outing and one member has not checked in
- **THEN** that member does not see the reward as theirs until they check in

### Requirement: Building reward earned by activity
A building reward SHALL name who gives it, what the person gets, and one rule: a number of outings of any kind, a number of outings on events carrying a given "good for" word, or the same group at the giver's events in each of a number of weeks. Only outings that count SHALL be counted. A ticket for an event that would count toward a building reward the person has not yet earned SHALL show that reward with their progress and which step this event would be.

#### Scenario: Fourth of five runs
- **WHEN** a person with three counted group runs views a run, and a reward needs five group runs
- **THEN** the ticket shows the reward with three steps done and says this would be their fourth of five

#### Scenario: Earned
- **WHEN** that person's fifth group run counts
- **THEN** the reward is earned and its coupon reads "Ready"

#### Scenario: Same group, weeks running
- **WHEN** a reward needs the same group in each of three weeks, and at least two people have checked in together at the giver's events in each of the last three weeks
- **THEN** the reward is earned for those people

#### Scenario: A missed week
- **WHEN** the same pair came two weeks ago and this week but not last week
- **THEN** the reward is not earned and progress shows one week

### Requirement: Rewards a person is earning
The system SHALL list for a signed-in person every building reward they have made progress on or earned and not yet used, with the giver, the reward and their progress.

#### Scenario: Progress shown
- **WHEN** a person has three of five group runs
- **THEN** the reward appears among those they are earning with "3 of 5 group runs"

#### Scenario: No progress
- **WHEN** a person has made no progress on a building reward
- **THEN** it is not among those they are earning

### Requirement: Using a reward
A person entitled to an unlocked group reward or an earned building reward SHALL be able to show it, with the giver, the reward and the current time, and mark it used. A group reward SHALL be marked used once per outing by any checked-in member; a building reward once by the person who earned it. After that the system SHALL show that it was used and when, and SHALL refuse a second mark.

#### Scenario: Show at the counter
- **WHEN** a person's group reward has unlocked
- **THEN** the top bar shows "Show at the counter" with the reward and a time that keeps moving

#### Scenario: Mark used
- **WHEN** a checked-in member marks the group reward used
- **THEN** every member of that outing sees it as used with the time

#### Scenario: Two mark at once
- **WHEN** two members mark the same reward used at the same moment
- **THEN** one time is stored

#### Scenario: Used building reward
- **WHEN** a person marks an earned building reward used
- **THEN** it leaves the rewards they are earning

### Requirement: Nothing locked is shown
The system SHALL NOT show a person a reward they cannot have, whether locked, greyed or teased. The system SHALL NOT show a price for going alone, a countdown, or a deadline for filling a group.

#### Scenario: Reward for a higher level only
- **WHEN** a reward has no version for a Member and a Member views its event
- **THEN** the ticket shows no reward

#### Scenario: Event with no reward
- **WHEN** an event has no reward
- **THEN** its ticket makes no reward claim

### Requirement: Rewards entered by the admin
The admin SHALL be able to add, change and hide a reward on the campus admin page. A hidden reward SHALL stop showing on tickets. An outing whose reward was already marked used SHALL keep what was used.

#### Scenario: Add a group reward
- **WHEN** the admin adds "A drink and a pastry, $4.50 each" from Northside Coffee for a group of three on an event
- **THEN** that event's ticket shows the reward on its stub

#### Scenario: Head count of one
- **WHEN** the admin tries to save a group reward with a head count of one
- **THEN** the system refuses

#### Scenario: Hide after use
- **WHEN** the admin hides a reward that one outing has already used
- **THEN** that outing still shows what it used and when

