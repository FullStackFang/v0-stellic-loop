## ADDED Requirements

### Requirement: Stable namespaced group addresses
The system SHALL resolve a canonical `@namespace/slug` to an existing organization/loop ID, using the normalization and uniqueness rules in design.md. Addresses SHALL be immutable in this slice, retired without reassignment, and managed only through verified root-owner authority. An address SHALL NOT grant membership, imply institutional verification or encode authorization ancestry.

#### Scenario: Concurrent address registration
- **WHEN** two authorized owners attempt to register the same canonical address
- **THEN** the database permits one binding and rejects the other without reassigning an existing group

#### Scenario: Claimed affiliation
- **WHEN** a user types a cohort handle or claims that affiliation in assistant text
- **THEN** their membership, role and representative authority remain unchanged

### Requirement: Consent-filtered discovery
Delegated listing and resolution SHALL require current verified identity, membership, token scope and an exact-scoped active `plan:read` lease for each returned group. They SHALL return only minimal authorized identifiers/labels, audit before output and recheck access. Unavailable and unauthorized handles SHALL have indistinguishable outcomes. First-party consent selection SHALL remain possible through the existing authorized portal loop picker without an existing delegated lease.

#### Scenario: Ambiguous short handle
- **WHEN** `@emba2027` matches two currently authorized and consented groups
- **THEN** resolution returns those choices and performs no read or mutation using an arbitrarily selected group

#### Scenario: Hidden or unconsented match
- **WHEN** a handle exists but the caller lacks current membership or this client's scoped lease
- **THEN** resolution returns no group metadata, match count or roster and supplies only generic guidance to the first-party connections page

#### Scenario: Cached handle after removal
- **WHEN** a client reuses a previously resolved stable ID after membership removal or lease revocation
- **THEN** subsequent group discovery, content reads and writes are denied

### Requirement: Independent affiliations
The system SHALL preserve independent membership and permissions for overlapping groups. Resolving multiple names SHALL NOT merge their memory, grant access between them or establish a shared output audience. Group references SHALL remain bound to explicit stable IDs through review and execution.

#### Scenario: Two cohorts in one prompt
- **WHEN** a member mentions two cohorts but has consent for only one
- **THEN** only the permitted cohort can be queried and no information about the other contributes to the response
