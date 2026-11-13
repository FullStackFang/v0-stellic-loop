## ADDED Requirements

### Requirement: A member chooses how each group reaches them
A member SHALL be able to choose, separately for each group they belong to, one way Loop reaches them: in their assistant and on the site only, by email, by WhatsApp, or not at all. The choice SHALL be changeable on the site at any time and SHALL take effect for the next message. Whatever the choice, everything SHALL remain visible to the member on the site and through their assistant.

#### Scenario: Different choice per group
- **WHEN** a member chooses email for one group and nothing for another
- **THEN** a new ask in the first group is emailed to them and a new ask in the second sends them nothing

#### Scenario: "Not at all" still shows on the site
- **WHEN** a member who chose nothing opens the group page
- **THEN** the open ask is listed there and they can answer it

### Requirement: The default is stated at joining
A new member's choice SHALL default to email at the address they signed in with, covering asks and announcements an organizer chooses to send. The join page SHALL state the default in one plain sentence with the control to change it beside it, before the person confirms joining.

#### Scenario: Joining shows the default
- **WHEN** a person is about to join a group
- **THEN** the page says how the group will reach them and lets them change it before confirming

#### Scenario: Changing it at joining
- **WHEN** a person selects "in my assistant and on the site only" and then joins
- **THEN** no email is sent to them for that group

### Requirement: Stopping messages takes one tap
Every message Loop sends SHALL carry a way to stop messages from that group that works in one tap without signing in. Using it SHALL set the member's choice for that group to not at all, and SHALL affect no other group.

#### Scenario: Stop from an email
- **WHEN** a member taps the stop link in an email from one group
- **THEN** that group sends them no further messages and their other groups are unchanged

### Requirement: WhatsApp needs the member's own opt-in
WhatsApp SHALL be selectable only after the member has sent a message from their own WhatsApp account to Loop's number from the preferences page, which links that number to them. A member SHALL be able to end it by choosing another way on the site or by sending "stop" to Loop's number. A number SHALL be linked to at most one member.

#### Scenario: Opting in
- **WHEN** a member taps the WhatsApp control, sends the pre-filled message, and Loop receives it
- **THEN** their number is linked, WhatsApp becomes their choice for that group, and Loop confirms in the chat

#### Scenario: Stop by message
- **WHEN** a linked member sends "stop" to Loop's number
- **THEN** Loop sends them nothing further on WhatsApp for any group and tells them how to turn it back on

### Requirement: Preferences follow membership
When a member leaves a group their choice for that group SHALL be deleted. On account deletion all choices and any linked number SHALL be deleted. A person's export SHALL list their choices.

#### Scenario: Leaving a group
- **WHEN** a member who chose email leaves a group
- **THEN** no message for that group is sent to them afterwards, including a reminder already scheduled
