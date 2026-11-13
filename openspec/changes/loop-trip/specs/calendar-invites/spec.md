## ADDED Requirements

### Requirement: A plan sends calendar invites to those who are in
When an idea becomes a plan, Loop SHALL send a calendar invite by email to each member who is in and whose reach choice for the group allows email. The invite SHALL state the plan's name, time, place and the group's name. It SHALL NOT list the other members who are in.

#### Scenario: Three people in
- **WHEN** an idea with three people in becomes a plan and two of them allow email
- **THEN** two invites are sent and the third member sees the plan on the site, in their assistant and in the calendar feed

#### Scenario: No names in the invite
- **WHEN** an invite is sent
- **THEN** it contains no other member's name or address

### Requirement: Changes and cancellations update the same calendar entry
A change to a plan's time or place SHALL send an update that replaces the same calendar entry. Cancelling a plan SHALL send a cancellation. A member who says they are in after the plan was made SHALL receive the invite then. A member who drops out SHALL receive a cancellation for themselves only.

#### Scenario: Time moved
- **WHEN** the proposer moves a plan from 15:00 to 16:00
- **THEN** each invited member's calendar entry moves, and no second entry appears

#### Scenario: One person drops out
- **WHEN** one member drops out of a plan
- **THEN** only that member receives a cancellation and the others' entries are unchanged

### Requirement: Organizers can send an event as an invite
An owner or organizer SHALL be able to choose to send a fixed event as a calendar invite to the members who marked interest in it, under the same rules for content, updates and reach choices.

#### Scenario: Mixer invite
- **WHEN** an organizer chooses to send invites for an event with nine interested members, seven of whom allow email
- **THEN** seven invites are sent

### Requirement: Each member can subscribe to a group's calendar
A member SHALL be able to get a private subscription address for a group's calendar that works in common calendar applications. The feed SHALL contain the group's fixed events and plans with name, time and place. It SHALL contain no names of who is interested or in, no ideas that are not yet plans, and no travel entries. The address SHALL carry an unguessable token, SHALL be replaceable by the member, and SHALL stop working when the member leaves the group.

#### Scenario: Subscribing
- **WHEN** a member adds their feed address to their calendar application
- **THEN** the group's fixed events and plans appear, and a new plan appears on the next refresh

#### Scenario: Replacing the address
- **WHEN** a member replaces their feed address
- **THEN** the old address returns nothing

#### Scenario: After leaving
- **WHEN** a member who has left the group has their old feed address fetched
- **THEN** it returns nothing

### Requirement: Invites and feeds are checked in the common calendars
Before release, an invite, an update and a cancellation, and the feed, SHALL each be checked in Google Calendar, Apple Calendar and Outlook, and the results recorded in this change.

#### Scenario: Recorded check
- **WHEN** the change is ready for release
- **THEN** the change holds a note of the result in each of the three calendars for invite, update, cancellation and feed
