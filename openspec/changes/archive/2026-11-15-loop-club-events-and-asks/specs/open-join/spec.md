## ADDED Requirements

### Requirement: An organizer can let the join link admit on sign-in
A group's owner or organizer SHALL be able to set the group's existing join link to one of two modes: ask first (the default, unchanged) or admit on sign-in. In admit-on-sign-in mode, a signed-in person who opens the link and confirms SHALL become a member with the right to post, with no approval step. This setting SHALL be changeable on the site only.

#### Scenario: Default is unchanged
- **WHEN** a group has never changed its join mode and a signed-in person opens the join link
- **THEN** a membership request is created for an organizer to approve, as before

#### Scenario: Admit on sign-in
- **WHEN** the join mode is admit on sign-in and a signed-in person opens the link and confirms
- **THEN** they become a member with the right to post and land on the group page

#### Scenario: Not settable by an assistant
- **WHEN** an organizer's assistant attempts to change the join mode
- **THEN** the attempt is refused

### Requirement: Admission grants membership and nothing more
A person admitted by the join link SHALL never receive an owner or organizer role by that route, and SHALL receive no assistant grant. A person who was removed from the group SHALL NOT be re-admitted by the link.

#### Scenario: No elevated role
- **WHEN** a person joins through an admit-on-sign-in link
- **THEN** their role is member, and no assistant has access to the group on their behalf until they grant it

#### Scenario: Removed member tries the link again
- **WHEN** a person an organizer removed opens the admit-on-sign-in link
- **THEN** they are not admitted and are told to contact an organizer

### Requirement: The organizer can close the door
An owner or organizer SHALL be able to switch the mode back to ask first, and to replace the join link so the old one stops working. Either action SHALL take effect for the next person who opens the link. People already admitted SHALL remain members.

#### Scenario: Link replaced
- **WHEN** an organizer replaces the join link and someone opens the old one
- **THEN** the old link admits nobody and creates no request

### Requirement: Share links lead to joining
When a signed-in person who is not in the group opens an ask or event share link, the page SHALL offer the group's join step according to its mode. After joining in admit-on-sign-in mode the person SHALL be returned to the item they opened.

#### Scenario: Answering after joining
- **WHEN** a signed-in non-member opens an ask link for a group in admit-on-sign-in mode and joins
- **THEN** they are returned to the ask and can answer it
