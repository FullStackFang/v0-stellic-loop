# Spec Delta

## Purpose

Answers "do people come in through pins and re-drops?" by letting the organizer hand out labeled share links and recording which one each member first arrived through.

## ADDED Requirements

### Requirement: Organizer creates drops
The organizer SHALL be able to create drops for a loop from its settings, each with a label and a kind (`group_chat`, `pin`, `person`, `event_page`, `qr`), and copy each drop's URL `/l/<slug>?d=<token>`. Tokens SHALL be unguessable and carry no personal data.

#### Scenario: Create and copy
- **WHEN** the organizer adds a drop labeled "Donlon 2F GroupMe" of kind `group_chat`
- **THEN** the settings panel shows it with a copyable URL containing a random token

### Requirement: Attribution on first tap-in only
When a person first taps into a loop through a URL with a valid drop token, the system SHALL record that drop on the membership. The system SHALL never change it afterwards, including on re-tap-in, intent change, leave, or return.

#### Scenario: First tap-in with drop
- **WHEN** a new member taps in via `?d=<token>`
- **THEN** their membership records that drop

#### Scenario: Invalid token
- **WHEN** the token matches no drop of that loop
- **THEN** the tap-in proceeds with no drop recorded and no error shown

#### Scenario: Later visit with a different drop
- **WHEN** an existing member opens the loop via a different drop URL
- **THEN** their recorded drop is unchanged

### Requirement: Drop survives the sign-in round trip
A drop token present when a signed-out person starts tapping in SHALL be applied when the tap-in completes after sign-in.

#### Scenario: Signed-out round trip
- **WHEN** a signed-out person starts at `?d=<token>` and completes sign-in
- **THEN** the resulting membership records that drop

### Requirement: Crews are flagged single-drop or mixed
A crew SHALL be flagged `single_drop` when every active member has the same non-null drop, otherwise `mixed`.

#### Scenario: All from one pin
- **WHEN** all four members of a crew arrived through the same drop
- **THEN** the crew is `single_drop`

#### Scenario: One without a drop
- **WHEN** three members share a drop and one has none
- **THEN** the crew is `mixed`

### Requirement: Attribution is organizer-only
Drop attribution SHALL be visible only on the organizer dashboard (taps-in per drop and the per-crew flag). The public page, waiting page, member page, and emails SHALL show nothing about drops.

#### Scenario: Member page
- **WHEN** any member page is rendered
- **THEN** the response contains no drop label, token, or count
