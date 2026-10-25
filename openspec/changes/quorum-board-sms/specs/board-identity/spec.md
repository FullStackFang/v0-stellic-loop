# Spec Delta

## Purpose

Identity accepts US numbers only, sends the sign-in code by text, and fails visibly when it can't.

## MODIFIED Requirements

### Requirement: A person is a phone number and a name
The system SHALL identify a person by a phone number normalised to E.164 and a display name. There SHALL be no passwords, no email, and no account creation step separate from the first answer. The person record SHALL be global across boards. A number that is not a valid US number SHALL be refused with "US numbers only for now."; existing people with other numbers SHALL keep working.

#### Scenario: Same number on two boards
- **WHEN** a person who answered on board A answers on board B with the same number
- **THEN** one person row exists and both boards list the same person

#### Scenario: Number formatting
- **WHEN** a person enters "(607) 555-0123"
- **THEN** it is stored as "+16075550123" and a second entry of "+1 607 555 0123" matches the same person

#### Scenario: Non-US number
- **WHEN** a visitor enters "+44 7700 900123"
- **THEN** nothing is recorded and the form says "US numbers only for now."

### Requirement: Known numbers on a cookieless device verify once
When a response arrives from a number already known and the request carries no valid cookie, the system SHALL NOT record the answer. It SHALL issue a six-digit code through the notifier, store only its hash with a ten-minute expiry, and accept at most five attempts before requiring a new code. A correct code SHALL record the pending answer and set the cookie. When texts are configured the code SHALL be sent by text reading "Quorum code: {code}. It expires in 10 minutes." If the send fails, the stored code SHALL be discarded and the form SHALL say "We couldn't text that number. Try again." instead of asking for a code.

#### Scenario: Known number, new phone
- **WHEN** Priya, already on the roster, taps "I'm in" from a device with no cookie
- **THEN** no answer is recorded, a code is issued, and the page asks for it

#### Scenario: Correct code
- **WHEN** Priya enters the correct code within ten minutes
- **THEN** her answer is recorded and later requests from that device need no code

#### Scenario: Too many attempts
- **WHEN** a sixth wrong code is entered
- **THEN** the code is invalidated and a new one must be issued

#### Scenario: Code cannot be sent
- **WHEN** Priya taps "I'm in" from a new device and Twilio rejects the code text
- **THEN** no code is stored, no answer is recorded, and the form says "We couldn't text that number. Try again."

### Requirement: Magic-link tokens set the session
The system SHALL accept single-use tokens at `/m/<token>`. A valid, unexpired token SHALL set the session cookie for the token's person and redirect to the token's stored destination, or else to the requested same-origin path, carrying the token's stored source or else the `src` parameter. A used or expired token SHALL redirect to the same path without setting a cookie.

#### Scenario: Tapping a link from a text
- **WHEN** a person opens `/m/<token>?to=/p/abc&src=on_text` with a fresh token
- **THEN** the cookie is set, the token is marked used, and the browser lands on `/p/abc`

#### Scenario: Short link with a stored destination
- **WHEN** a person opens `/m/<token>` whose token stores `/p/abc` and source `on_text`
- **THEN** the cookie is set and the browser lands on `/p/abc` with source `on_text`
