## ADDED Requirements

### Requirement: Independent member participation
The portal SHALL support sign-in/invitation, trip resources/updates, activity creation and participation, conditions, consent, withdrawal, private-want correction, feedback, assistant leases/audit and export/delete without requiring an assistant. It SHALL show exact details and disclosure before consequential confirmation and use timezone labels for trip activities.

#### Scenario: Member without MCP
- **WHEN** an invited member uses only a mobile browser
- **THEN** they can read the itinerary, commit with conditions, see resolution and withdraw

### Requirement: Scoped organizer operations
The organizer portal SHALL provide authorized loops/roles/invitations, document processing/versioning, announcement corrections, activity deadlines and safe reports. It SHALL expose processing failures and unresolved trip-knowledge conflicts without exposing private memory or member audit logs. It SHALL provide no individual engagement score or sensitive segmentation.

#### Scenario: Upload fails
- **WHEN** document indexing fails
- **THEN** the organizer sees a retryable processing status rather than a false ready state, and members are told evidence is unavailable

### Requirement: Accessible failure and recovery flows
The portal SHALL support keyboard and mobile use and clear states for expired invitations, revoked access, no data, stale confirmations, processing errors and retries. User-facing language SHALL distinguish interest, conditional commitment, finalized plan and attendance.

#### Scenario: Stale activity review
- **WHEN** a member confirms an activity that changed while the review was open
- **THEN** the portal explains the change and requests fresh confirmation without silently submitting old consent

### Requirement: End-to-end pilot acceptance
The release SHALL demonstrate an invited EMBA root with Vietnam and Estonia loops, a signed announcement, cited bus answer, eight-person/six-result conditional fixture with safe organizer output, private Hanoi planning and revocation. Actual Claude and ChatGPT accounts SHALL verify remote OAuth/read/revoke and confirmed-write behavior with client/date evidence. A local HTTP test alone SHALL not qualify as remote acceptance.

#### Scenario: Full rehearsal
- **WHEN** the pilot acceptance run completes locally and remotely
- **THEN** the report records actual tests and connector outcomes, denied alternate-user access, privacy-safe organizer views and any unresolved launch gate
