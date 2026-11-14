## ADDED Requirements

### Requirement: Private group setup and membership
The system SHALL let an authorized pilot owner create a private group and manage recipient-bound invitations without granting institutional authority.

#### Scenario: Independent group creation
- **WHEN** an authorized pilot owner creates a group
- **THEN** the group, tenant, owner membership and unique address are created atomically without access to another tenant.

#### Scenario: Invitation acceptance
- **WHEN** a verified invited recipient accepts a valid unexpired invitation
- **THEN** they receive only the invitation's authorized membership, without an automatic assistant lease.

#### Scenario: Requesting access
- **WHEN** an authenticated nonmember follows an enabled request-access link
- **THEN** they can view only the deliberately published preview and submit a deduplicated request, with membership granted only after authorized approval.

### Requirement: Bounded resource publishing
The system SHALL support pasted text, UTF-8 text/Markdown files and text-based PDFs within documented limits, preserving source locations and version identity.

#### Scenario: Valid upload
- **WHEN** an organizer uploads a supported resource
- **THEN** processing starts automatically and produces cited searchable passages or a visible retriable failure, without duplicate resources on retry.

#### Scenario: Unsupported content
- **WHEN** a file is unsupported, unreadable, scanned-only, encrypted or exceeds limits
- **THEN** the system rejects it clearly rather than silently truncating or reporting successful indexing.

#### Scenario: Updated or deleted content
- **WHEN** an authorized organizer replaces or deletes a resource
- **THEN** subsequent retrieval and direct source reads cannot expose superseded or deleted content.

### Requirement: Individually authorized assistant retrieval
The system SHALL expose the same permission-checked resources through remote MCP and an authenticated JSON API, using verified identities and scoped expiring grants.

#### Scenario: Authorized retrieval
- **WHEN** a current member with an active exact-group assistant grant searches the group
- **THEN** the response includes bounded relevant passages with source/version/location metadata and untrusted-content labeling.

#### Scenario: Access removed
- **WHEN** membership or the assistant grant expires or is revoked
- **THEN** later delegated discovery, searches and source reads deny access even with previously known resource IDs; membership removal also denies browser source access, while assistant-grant revocation alone preserves the member's independent website access.

#### Scenario: Malicious resource content
- **WHEN** a resource contains instructions or tool-call text
- **THEN** it is returned only as untrusted data and the server performs no content-triggered action.

### Requirement: Truthful onboarding and acceptance
The system SHALL distinguish implemented services, configured deployment and observed assistant compatibility.

#### Scenario: Connector unavailable
- **WHEN** required hosted authentication or endpoint configuration is missing
- **THEN** the connection page explains the missing setup and does not claim the assistant is connected.

#### Scenario: Pilot acceptance
- **WHEN** the resource-workspace pilot is declared ready
- **THEN** a real supported assistant has completed authenticated retrieval, update and revocation tests against the hosted service, with other hosts labeled according to their actual results.
