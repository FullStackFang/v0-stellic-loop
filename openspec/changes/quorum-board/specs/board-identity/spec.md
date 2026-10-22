# Spec Delta

## Purpose

A person is a phone number and a name, with a cookie as the whole session, so answering costs nothing for a stranger and impersonating a known person is not possible.

## ADDED Requirements

### Requirement: A person is a phone number and a name
The system SHALL identify a person by a phone number normalised to E.164 and a display name. There SHALL be no passwords, no email, and no account creation step separate from the first answer. The person record SHALL be global across boards.

#### Scenario: Same number on two boards
- **WHEN** a person who answered on board A answers on board B with the same number
- **THEN** one person row exists and both boards list the same person

#### Scenario: Number formatting
- **WHEN** a person enters "(607) 555-0123"
- **THEN** it is stored as "+16075550123" and a second entry of "+1 607 555 0123" matches the same person

### Requirement: Unknown numbers answer with no round trip
When a response arrives from a number the system has never seen, the system SHALL create the person, record the answer, set the session cookie, and write a `person_added` event naming the proposal that brought them, all in one request.

#### Scenario: First answer from a stranger
- **WHEN** a visitor with no cookie taps "I'm in" on a proposal and submits a name and a number not on any roster
- **THEN** the answer is recorded, the person is on the board's roster, the cookie is set, and a `person_added` event with that proposal id exists

### Requirement: Known numbers on a cookieless device verify once
When a response arrives from a number already known and the request carries no valid cookie, the system SHALL NOT record the answer; it SHALL issue a six-digit code through the notifier, store only its hash with a ten-minute expiry, and accept at most five attempts before requiring a new code. A correct code SHALL record the pending answer and set the cookie.

#### Scenario: Known number, new phone
- **WHEN** Priya, already on the roster, taps "I'm in" from a device with no cookie
- **THEN** no answer is recorded, a code is issued, and the page asks for it

#### Scenario: Correct code
- **WHEN** Priya enters the correct code within ten minutes
- **THEN** her answer is recorded and later requests from that device need no code

#### Scenario: Too many attempts
- **WHEN** a sixth wrong code is entered
- **THEN** the code is invalidated and a new one must be issued

### Requirement: The session cookie is signed and long-lived
The session SHALL be an httpOnly, SameSite=Lax cookie carrying the person id signed with a server secret, valid for one year and refreshed on every mutation. A cookie with a bad signature SHALL be treated as absent.

#### Scenario: Tampered cookie
- **WHEN** a request carries a cookie whose signature does not verify
- **THEN** the request is handled as if no cookie were present

### Requirement: Magic-link tokens set the session
The system SHALL accept single-use tokens at `/m/<token>` that, when valid and unexpired, set the session cookie for the token's person and redirect to the requested same-origin path, carrying the source. A used or expired token SHALL redirect to the path without setting a cookie.

#### Scenario: Tapping a link from a text
- **WHEN** a person opens `/m/<token>?to=/p/abc&src=on_text` with a fresh token
- **THEN** the cookie is set, the token is marked used, and the browser lands on `/p/abc`

### Requirement: Name visibility is the person's switch
Each person SHALL have a "show my name" setting, default on. When off, the person SHALL still count everywhere and SHALL be listed as "+1 anonymous" wherever names appear.

#### Scenario: Name off
- **WHEN** Priya turns her name off and is in on a proposal with three other yeses
- **THEN** the proposal shows "4 in" and lists three names and "+1 anonymous"
