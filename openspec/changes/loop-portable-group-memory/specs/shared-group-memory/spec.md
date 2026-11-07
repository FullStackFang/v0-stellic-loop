## ADDED Requirements

### Requirement: Separate shared canonical memory
The system SHALL store shared notes, proposals, questions and decisions separately from person-owned Wants/Intents. Records SHALL carry stable IDs, organization/loop, immutable versions, lifecycle state, author/client attribution, publication time and structured provenance. Text SHALL be limited to 2,000 characters and dependencies to 8. Scoped personal memory SHALL remain private and SHALL NOT become a shared source through a group handle or organizer privilege.

#### Scenario: Private preference mentioned near a group
- **WHEN** a personal preference is saved with EMBA trip context
- **THEN** group-memory retrieval does not return that preference or derive a group preference from it

### Requirement: Explicit publication and decision authority
Publication SHALL require current `post` authority and reviewed content; followers SHALL NOT publish. Decisions and promotion to decision SHALL require current `manage` authority and record the organizer approver. Decisions SHALL be presented as organizer-recorded statements, not inferred votes, unanimous agreement or authority to bind members. Members SHALL correct/withdraw their own non-decision records only while authorized; organizers SHALL moderate records in their managed scope. Every mutation of a current decision, including withdrawal or demotion to another kind, SHALL require current `manage` authority regardless of the original author.

#### Scenario: Suggestion is not consensus
- **WHEN** a member publishes "We should leave at nine" as a proposal
- **THEN** it remains a proposal until an organizer explicitly approves a decision version

#### Scenario: Decision promotion denied
- **WHEN** a member without management authority tries to publish or correct a decision
- **THEN** the operation is denied even if an assistant claims that everyone agreed

#### Scenario: Original author withdraws an approved decision
- **WHEN** an ordinary original author or demoted organizer attempts to withdraw or demote a current decision
- **THEN** the operation is denied despite authorship or earlier organizer status

### Requirement: Corrections and retry identity
Corrections SHALL require the expected current version and append history. Ordinary retrieval SHALL return current active records only. Exact operation retries SHALL not add versions; changed payloads using the same operation ID SHALL conflict. Similarity SHALL NOT automatically merge distinct statements or raise their authority.

#### Scenario: Cross-client stale correction
- **WHEN** Claude and ChatGPT prepare different corrections to version 1 and one commits version 2
- **THEN** the other correction fails as stale and cannot overwrite version 2

### Requirement: Authorized evidence and transitive invalidation
Verified source dependencies SHALL reference accessible same-loop document or shared-memory versions, form an acyclic graph bounded to 8 levels and 64 unique transitive source versions per record, and be revalidated before output. Publication and correction SHALL reject excessive dependency graphs rather than truncate required checks. Unsourced approved content SHALL be labeled as a member submission. Source correction/deletion/withdrawal SHALL invalidate dependent claims and summaries transitively before subsequent delivery. Untrusted text and URLs SHALL NOT execute commands, cause network fetches or grant authority.

#### Scenario: Source correction invalidates a derived decision summary
- **WHEN** an itinerary version is superseded while a summary depends on it
- **THEN** the old derived summary is excluded from ordinary context and marked for review rather than returned as current evidence

#### Scenario: Cyclic or cross-group source
- **WHEN** a publication introduces a self/cyclic dependency or references another group's source
- **THEN** the write is rejected without exposing inaccessible content

#### Scenario: Excessive dependency expansion
- **WHEN** an otherwise valid candidate exceeds the depth or transitive source budget
- **THEN** publication is rejected rather than accepting a record whose dependencies cannot all be checked within the declared bound

### Requirement: Withdrawal and privacy lifecycle
Withdrawal SHALL deny content through current, historical, search and derived endpoints. Export, personal deletion and restore handling SHALL account for new records and receipts. Organization-owned publications SHALL NOT be silently erased when an author leaves; retained attribution/history SHALL follow the approved foundation policy before real-member enrollment. The product SHALL distinguish withdrawal/access denial from backup erasure and disclose retention limits.

#### Scenario: Withdrawn content requested by historical version
- **WHEN** a client requests an old version after withdrawal
- **THEN** the withdrawn text and its dependent excerpts are unavailable despite knowing the record ID

#### Scenario: Deleted author restored from backup
- **WHEN** a backup containing the author's new receipts/attribution is restored
- **THEN** the current tombstone/policy process runs before output and does not restore deleted personal access or pending authority
