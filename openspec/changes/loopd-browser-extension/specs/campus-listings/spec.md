## ADDED Requirements

### Requirement: A feed event keeps the address of its page
When a feed item gives the address of its own page at the source, the system SHALL keep that address with the event and SHALL update it when the item changes. The address SHALL be used only to recognise the event from its page. It SHALL NOT be shown, and the rule that a feed event shows no link out SHALL stand.

#### Scenario: The feed gives an address
- **WHEN** a feed item carries the address of its page
- **THEN** the event keeps it, and the event's ticket and panel still show no link that leaves Loopd

#### Scenario: The feed gives none
- **WHEN** a feed item carries no page address
- **THEN** the event is imported as before, with no address kept

#### Scenario: Not an https address
- **WHEN** a feed item's address does not start with `https://`
- **THEN** no address is kept
