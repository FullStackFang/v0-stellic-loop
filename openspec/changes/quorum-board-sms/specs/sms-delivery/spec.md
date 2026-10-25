# Spec Delta

## Purpose

How the board's messages reach phones: which notifier runs, who is texted, how each send is recorded, opt-out, the links texts carry, and what a failure does.

## ADDED Requirements

### Requirement: The notifier is Twilio only when Twilio is configured
The system SHALL send texts through Twilio's Messages API, using a Messaging Service, only when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID` are all set. When any is missing, the system SHALL use the log notifier, which sends nothing.

#### Scenario: No Twilio settings
- **WHEN** a lock happens with no Twilio variables set
- **THEN** no request is made to Twilio and each would-be text is logged with a `text_sent` event of channel `log`

#### Scenario: Twilio configured
- **WHEN** all three Twilio variables are set and a lock happens
- **THEN** each yes is sent one message through the Messaging Service

### Requirement: Every text attempt writes one event
For every recipient of every message, the system SHALL write one `text_sent` event with channel `sms`, the message kind, the person, and a status of `sent` (with the Twilio message sid), `failed` (with Twilio's error code) or `skipped` (with the reason). A sign-in code SHALL never appear in an event or a log line.

#### Scenario: Code text recorded without the code
- **WHEN** a sign-in code is texted
- **THEN** a `text_sent` event of kind `code` and status `sent` exists and no event or log line contains the six digits

#### Scenario: Failure recorded
- **WHEN** Twilio rejects a message with an error code
- **THEN** a `text_sent` event with status `failed` and that error code exists

### Requirement: Only US numbers are texted
The system SHALL text only numbers that start with `+1` and are valid for the US. Any other number SHALL be skipped with reason `not_us`.

#### Scenario: Non-US person on the board
- **WHEN** an intent locks and one yes has a `+44` number
- **THEN** no message is sent to that number and a `skipped` event with reason `not_us` is written

### Requirement: STOP is honored
When Twilio refuses a message because the recipient has opted out (error 21610), the system SHALL set `sms_opt_out` on that person. A person with `sms_opt_out` SHALL receive no texts except a sign-in code they asked for, and a successful sign-in code SHALL clear `sms_opt_out`.

#### Scenario: Opted-out person on ON
- **WHEN** a person who replied STOP is in on an intent that locks
- **THEN** no message is sent to them and a `skipped` event with reason `opted_out` is written

#### Scenario: Opted-out person asks for a code
- **WHEN** a person with `sms_opt_out` asks for a sign-in code on a new device
- **THEN** the code is sent

#### Scenario: Twilio reports opt-out
- **WHEN** a send fails with error 21610
- **THEN** the person's `sms_opt_out` is true

### Requirement: Texts to one person sign that person in
Every text addressed to one person, except the sign-in code and the one-more text, SHALL carry a link of the form `<app>/m/<token>`. The token SHALL be single-use, expire 24 hours after it is issued, belong to that person, and store the destination path and the text's source. Opening it SHALL behave as the magic-link requirement in `board-identity` describes, using the stored destination and source.

#### Scenario: Tapping the ON text
- **WHEN** Priya taps the link in her ON text for "Suits" within 24 hours on a new phone
- **THEN** she is signed in, lands on the Suits page, and later actions record source `on_text`

#### Scenario: Expired link
- **WHEN** the same link is opened after 24 hours
- **THEN** the browser lands on the Suits page without being signed in

### Requirement: Follow-up texts never block the action
The ON, maybe, drop and one-more texts SHALL be sent after the action's transaction commits. A failure SHALL be recorded and SHALL NOT change the action's result or be retried.

#### Scenario: Twilio down during a lock
- **WHEN** an intent is locked and every Twilio request fails
- **THEN** the intent is ON, the person who locked it sees success, and one `failed` event per recipient exists

### Requirement: The drop text names who left
When a yes leaves an ON intent, the poster SHALL get "{name} dropped out of {title}. {n} in." with a sign-in link, where {name} is "Someone" if that person's name is off. Nobody else SHALL be texted.

#### Scenario: Marcus drops
- **WHEN** Marcus changes his answer from in to out on ON "Suits", leaving 7 in
- **THEN** the poster alone gets "Marcus dropped out of Suits. 7 in." with a link
