## ADDED Requirements

### Requirement: Authorized versioned resources
Organizers SHALL upload, version and remove bounded validated documents in authorized loops. Source files SHALL retain version and citation location. Search, citations and downloads SHALL enforce current inherited permissions, with private sources excluded before keyword/vector ranking and again before output.

#### Scenario: Similar private passage
- **WHEN** a private unauthorized document has the strongest semantic or keyword match
- **THEN** it contributes no passage, title, score or count to the caller's results

### Requirement: Idempotent observable processing
The system SHALL distinguish accepted, extracting, indexing, ready and failed processing states. Jobs SHALL use stable operation/source versions and SHALL not duplicate records after partial failure. Late output for obsolete/deleted sources or revoked authority SHALL be rejected. Derived summaries SHALL preserve source restrictions and invalidate when a source changes or is removed.

#### Scenario: Index fails after save
- **WHEN** canonical extraction succeeds but indexing fails
- **THEN** the portal shows indexing failure and retry updates the same source/version without duplicate knowledge

### Requirement: Evidence-based responses
Retrieved facts SHALL include document/version, passage location and authorized source link. Conflicting facts SHALL remain disputed until authorized supersession. A similarity score SHALL not be presented as correctness. Time-sensitive facts SHALL preserve activity timezone and itinerary version.

#### Scenario: Conflicting bus times
- **WHEN** two accessible current sources disagree on departure without explicit supersession
- **THEN** the tool returns both cited claims as disputed rather than selecting a fabricated definitive time

### Requirement: Signed announcement provenance
Announcements SHALL use canonical Ed25519-signed envelopes binding org/loop, ID, version, timestamp, key ID and content digest. Publishing SHALL verify current author authority. Key registration, rotation, compromise and historical verification SHALL be defined before release. Published versions SHALL be immutable; corrections SHALL create new versions. Service-held keys SHALL be labeled as service-attested authorship.

#### Scenario: Tampered envelope
- **WHEN** announcement text, destination loop or version changes without a valid new signature
- **THEN** the update cannot be returned as verified

### Requirement: Content never grants authority
Bodies, user titles, filenames, summaries and compiled text SHALL remain untrusted data. The server SHALL not execute embedded instructions, invoke tools or automatically fetch embedded URLs. Signatures SHALL not change this boundary.

#### Scenario: Injected document title
- **WHEN** a title or passage contains instructions to export another member's wants
- **THEN** it is returned only as untrusted content and causes no privileged action
