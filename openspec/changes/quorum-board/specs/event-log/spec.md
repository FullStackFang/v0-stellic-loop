# Spec Delta

## Purpose

Instrumentation is the product: every state change is a row with a source, written from day one so the stats slice is a query.

## ADDED Requirements

### Requirement: Every state change writes one event
The system SHALL write an event row with timestamp, board, proposal (when applicable), person (when applicable), type and source for: `proposal_posted`, `response`, `threshold_reached`, `proposal_idled`, `proposal_reopened`, `proposal_closed`, `detail_added`, `person_added`, `share_minted`, `text_sent`. Writes SHALL happen in the same transaction as the state change they record.

#### Scenario: Response event
- **WHEN** Marcus changes `maybe` → `in` on "Suits"
- **THEN** one `response` event exists with `data.prev='maybe'`, `data.next='in'`

### Requirement: Source is always recorded
Every event SHALL carry a source from: `group_link`, `proposal_link` (with the share id), `digest_link`, `on_text`, `one_more_text`, `maybe_nudge`, `fork`, `seed`, `direct`. A page visit's source SHALL be derived from the entry URL (share token, magic-link `src`, or the board) and carried through the session until the next entry.

#### Scenario: Entry through a share
- **WHEN** a person arrives via `?s=<token>` and responds two minutes later
- **THEN** the `response` event's source is `proposal_link` with that share id

### Requirement: Once-only events are enforced by the database
`threshold_reached` and `proposal_idled` SHALL be insertable at most once per proposal, enforced by the database rather than application checks.

#### Scenario: Second insert
- **WHEN** a second `threshold_reached` row is attempted for the same proposal
- **THEN** the insert fails and the first row is unchanged

### Requirement: Events never leave the server
Event rows SHALL be written and read only by server code; no page SHALL expose raw events in this change.

#### Scenario: No client access
- **WHEN** a browser requests the database with the public key
- **THEN** no rows are returned
