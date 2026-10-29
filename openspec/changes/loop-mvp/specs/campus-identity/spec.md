# Spec Delta

## Purpose

Gives every participant one verified identity, keyed by email and scoped to a single campus, so the same person can hold memberships in many loops without being re-created per loop.

## ADDED Requirements

### Requirement: Sign-in by emailed link
The system SHALL authenticate a person by sending a single-use sign-in link to their email address. No password SHALL exist.

#### Scenario: Link sent
- **WHEN** a person submits an email address
- **THEN** the system sends a single-use link and shows "check your email" without revealing whether the address was already known

### Requirement: Link lands on a confirm step
Opening the link SHALL show a page with a "Continue" button; the single-use token SHALL be consumed only when that button is pressed, so mail scanners that prefetch links do not consume it.

#### Scenario: Scanner prefetch
- **WHEN** a mail scanner fetches the link URL before the person opens it
- **THEN** the token is still valid when the person presses "Continue"

#### Scenario: Continue
- **WHEN** the person presses "Continue" on a valid, unexpired link
- **THEN** they are signed in and returned to the page they started from

#### Scenario: Link expired or reused
- **WHEN** the person presses "Continue" on an expired or already used link
- **THEN** the page shows an error and a form to send a new link

### Requirement: Campus resolved from exact email domain
The system SHALL resolve a person's Campus by exact match of the email domain against each campus's domain list, and SHALL refuse to send a link for a domain on no list.

#### Scenario: Allowed domain
- **WHEN** `sarah@cornell.edu` requests a link and `cornell.edu` is on the Cornell list
- **THEN** the link is sent and, on first sign-in, the Person is created in the Cornell campus

#### Scenario: Unknown domain
- **WHEN** `sarah@gmail.com` requests a link and no campus lists `gmail.com`
- **THEN** no link is sent and the page explains that a campus email is required

#### Scenario: Subdomain is not a match
- **WHEN** `a@med.cornell.edu` requests a link and only `cornell.edu` is listed
- **THEN** the request is refused like any unknown domain

### Requirement: One Person per verified email
The system SHALL maintain exactly one Person per verified email address, created on first sign-in and reused across every loop.

#### Scenario: Returning person taps into a second loop
- **WHEN** a signed-in person taps into a loop they have not joined before
- **THEN** a new Membership is created for the existing Person and no second Person is created

### Requirement: Person holds a display first name
The system SHALL require a first name on first sign-in and SHALL use only that first name wherever the person is shown to others.

#### Scenario: First sign-in
- **WHEN** a Person signs in for the first time
- **THEN** the system requires a first name before continuing
