## ADDED Requirements

### Requirement: Bounded structured candidates
Assistant capture SHALL accept one structured candidate at a time, bounded to 8 KiB encoded JSON and the destination schema. It SHALL reject transcript/history/message-array fields and unknown provenance fields. Preparation SHALL neither persist candidate bodies nor create memory, membership, commitments, notifications or approval. Candidate payloads SHALL be excluded from logs, traces, errors and audit content. Raw conversation compilation remains outside this slice.

#### Scenario: Transcript payload or failure canary
- **WHEN** an assistant submits transcript fields, oversized input or a candidate that fails validation with distinctive text
- **THEN** the request fails without storing or logging that content

### Requirement: Destination-specific first-party review
Personal candidates SHALL continue through existing first-party personal review. Shared candidates SHALL display exact group, audience, kind, text, source attribution, changed fields and originating client identity in authenticated first-party review. Client identity SHALL come from trusted server/provider configuration, showing the verified client ID and optional configured friendly name rather than an assistant-supplied label. Approval SHALL reject unknown/disallowed clients and revoked, expired or wrong-scope group-write leases for the member. A personal approval SHALL NOT authorize group publication. Review SHALL support the host-independent copy/paste bridge without placing payloads, credentials or confirmations in URLs. No ordinary chat assertion of approval SHALL substitute for this review.

#### Scenario: Personal-to-shared substitution
- **WHEN** an assistant changes a reviewed personal candidate into a shared group note
- **THEN** existing approval does not authorize the new destination and fresh shared review is required

#### Scenario: Forged connection label or altered client
- **WHEN** pasted candidate data claims a trusted assistant name but contains another client ID
- **THEN** review uses the configured identity for that ID, rejects it if unknown or without current scoped consent, and never approves authority based on the supplied name

### Requirement: Scoped exact confirmed mutations
Delegated group mutations SHALL require `group-memory:write` token scope and an exact-scoped active lease plus a ten-minute single-use confirmation bound to person, client, action, group, record, expected version, operation ID, mutation kind and canonical payload. Approval and execution SHALL validate current role and source access. Consumption and database effect SHALL be atomic. Existing leases SHALL NOT gain this new action implicitly.

#### Scenario: Modified payload or wrong client
- **WHEN** execution changes reviewed content, group, kind, sources, version or operation identity, or uses another client's confirmation
- **THEN** no publication/correction/withdrawal occurs

#### Scenario: Revoked authority after review
- **WHEN** membership, role, source access or the originating client's lease is revoked before execution
- **THEN** execution is denied despite a previously valid approval

### Requirement: Authorized recovery from lost responses
A successful mutation SHALL store a minimal operation receipt. An exact retry by the same currently authorized person/client SHALL return only operation ID, record ID, committed version and current lifecycle status without a second mutation. Receipts SHALL NOT contain or return old text, snippets or source metadata. Changed payloads, cross-client receipt requests and revoked clients SHALL be denied. This recovery SHALL NOT broaden replay behavior of existing activity/disclosure confirmations.

#### Scenario: Network response lost after commit
- **WHEN** the originating authorized client repeats the same successfully committed request
- **THEN** it receives the original record/version receipt and no extra version or approval consumption occurs

#### Scenario: Retry after a later correction or withdrawal
- **WHEN** an exact authorized retry follows correction, source invalidation or withdrawal of the committed memory
- **THEN** it returns only the minimal receipt with current lifecycle status and does not resurface prior content or reactivate the record
