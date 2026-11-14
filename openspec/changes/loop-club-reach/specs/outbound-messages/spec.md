## ADDED Requirements

### Requirement: Loop sends only four kinds of message
Loop SHALL send a message only for: a new ask, to members who can answer it; one reminder per ask, to members who have not answered; an announcement an organizer chose to send; and the result of an ask, to the person who asked, when it closes. Each SHALL go only to members whose choice for that group allows it, by the way they chose. A change of interest or a single answer SHALL never cause a message.

#### Scenario: New ask
- **WHEN** a member creates an ask in a group of ten where six chose email, two WhatsApp and two nothing
- **THEN** six emails and two WhatsApp messages are sent, and the two who chose nothing receive none

#### Scenario: Interest sends nothing
- **WHEN** twelve members mark interest in an event
- **THEN** no message is sent to anyone

#### Scenario: Announcement not marked to send
- **WHEN** an organizer posts an announcement without choosing to send it
- **THEN** it appears on the site and in assistants and no message is sent

### Requirement: One reminder, only to those who have not answered
For each ask Loop SHALL send at most one reminder to each member, 24 hours before the ask closes, or halfway to closing when the ask runs less than 48 hours. A member who has answered before the reminder is due SHALL NOT receive it. A closed ask SHALL send no reminder.

#### Scenario: Answered before the reminder
- **WHEN** a member answers an ask two days before it closes
- **THEN** they receive no reminder for it

#### Scenario: Short ask
- **WHEN** an ask is created to close in 10 hours
- **THEN** its reminder is due 5 hours after creation

#### Scenario: Closed early
- **WHEN** the asker closes an ask before its reminder is due
- **THEN** no reminder is sent

### Requirement: Limits and quiet hours
Loop SHALL send a member at most 3 messages per group per day and 10 per day across groups. Loop SHALL send nothing between 21:00 and 08:00 in the group's timezone; a message due in that window SHALL be sent at 08:00 unless its ask has closed by then. An item held back by a limit SHALL remain visible as waiting on the site and in the member's assistant.

#### Scenario: Night-time ask
- **WHEN** an ask is created at 23:00 in the group's timezone
- **THEN** its messages are sent at 08:00

#### Scenario: Fourth message in a day
- **WHEN** a fourth message for one group becomes due for a member on the same day
- **THEN** it is not sent and the item shows as waiting

### Requirement: A message reveals no other member
A message SHALL contain the group's name, the item, and the name of the person who asked or announced. It SHALL NOT contain another member's answer, interest, name, or whether they have answered.

#### Scenario: Reminder content
- **WHEN** a reminder is sent for an ask
- **THEN** it states the question, the closing time and how to answer, and names no member other than the asker

### Requirement: Messages about an ask carry a personal answer link
A message about an ask SHALL carry a link signed for one member and one ask. Opening it SHALL show the ask to answer as that member without signing in. A plain request for the link SHALL write nothing; an answer SHALL be recorded only when the form is submitted. The link SHALL stop working when the ask closes, when the member leaves the group, and when the member stops messages for the group. It SHALL NOT create a session or allow any other action.

#### Scenario: One-tap answer
- **WHEN** a member opens their personal link and picks an option
- **THEN** the answer is recorded as theirs and the page shows what they answered

#### Scenario: A scanner fetches the link
- **WHEN** a mail scanner requests the link without submitting the form
- **THEN** no answer is recorded

#### Scenario: Link after close
- **WHEN** a member opens their personal link after the ask has closed
- **THEN** no answer is accepted and the page says the ask has closed

#### Scenario: Link cannot do anything else
- **WHEN** the holder of a personal link requests any other page of the site
- **THEN** they are treated as signed out

### Requirement: Sends are reliable and never doubled
Messages SHALL be queued and sent through an outbox so that a failed send is retried and a send that succeeded is not repeated. A scheduled job SHALL send reminders and deferred messages. A reminder's due time SHALL be computed from the ask's closing time on each run, so a late run sends late and never twice. Sending SHALL be behind one switch that is off until the operator turns it on.

#### Scenario: Provider error
- **WHEN** the provider rejects a send with a temporary error
- **THEN** the message is retried later and delivered once

#### Scenario: Switch off
- **WHEN** the sending switch is off and an ask is created
- **THEN** nothing is sent and the ask shows as waiting everywhere else

### Requirement: Email delivery
Loop SHALL send email to the member's verified sign-in address from a domain the operator controls, with a plain-text part, the personal answer link, and the one-tap stop link.

#### Scenario: Email for a new ask
- **WHEN** a new ask is emailed to a member
- **THEN** the email shows the group, who asked, the question and closing time, one link to answer and one to stop messages from that group

### Requirement: WhatsApp delivery from Loop's own number
Loop SHALL send WhatsApp messages only to members who opted in, from its own business number, using message templates approved in advance for a new ask, a reminder and an announcement. For a pick-one ask with at most three options the message SHALL carry reply buttons, and a tap SHALL record that answer. For every other ask it SHALL carry the personal answer link. Inbound messages SHALL be verified by signature before being read. Loop SHALL NOT post into any group chat.

#### Scenario: Three-option ask
- **WHEN** a pick-one ask with three options is sent to an opted-in member
- **THEN** the message shows three buttons and tapping one records that answer and confirms it in the chat

#### Scenario: Unsigned webhook
- **WHEN** an inbound request arrives without a valid signature
- **THEN** it is rejected and nothing is recorded

#### Scenario: WhatsApp not ready
- **WHEN** the operator has not configured a WhatsApp number
- **THEN** WhatsApp is not offered as a choice and every other route works unchanged
