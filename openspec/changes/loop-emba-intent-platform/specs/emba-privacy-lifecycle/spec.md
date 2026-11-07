## ADDED Requirements

### Requirement: Explicit operational disclosure
Participation names SHALL be private by default and revealed only under activity-specific affirmative consent. Mere mutual interest SHALL not grant name access. Organizers SHALL not receive private wants or automatic named manifests. Live social proof SHALL use only coarse formation state with disclosed inference limitations.

#### Scenario: Organizer inspects participants
- **WHEN** an organizer requests a roster solely using organizer authority
- **THEN** private names and wants are denied

### Requirement: Safe aggregate release
Organizer reports SHALL use fixed close-of-activity partitions, suppress cells below five and complementary totals, and avoid arbitrary filters, overlapping releases and successive numeric deltas. Suppression SHALL not distinguish zero from small positive cells. Release checking SHALL consider all accessible numeric outputs. The system SHALL not claim formal anonymity.

#### Scenario: Eight interested and six confirmed
- **WHEN** eight people express interest and six resolve
- **THEN** the organizer sees no pair of counts or total that exposes the remaining two

#### Scenario: Repeated query
- **WHEN** an organizer refreshes or changes a filter to infer one person's transition
- **THEN** no additional numeric partition or changing count is released

### Requirement: First-party export and deletion
Reauthenticated members SHALL export their authorized personal data and request deletion through first-party flows. Deletion SHALL immediately revoke access, withdraw active commitments, suspend affected dependencies and remove live personal/derived data. Retained plan history SHALL remove direct identifiers and reconstructable stable participant pseudonyms. Exports SHALL exclude other members' private information.

#### Scenario: Derived preference deletion
- **WHEN** a member deletes their data after a preference was indexed and summarized
- **THEN** future retrieval excludes the preference, dependent summaries and pending worker outputs

### Requirement: Published retention and restore safety
Before real-member enrollment, the system SHALL publish approved exact retention durations for audit, history and backups, explain organization-publication exceptions, and implement deletion tombstones on restore. Backup retention SHALL not be described as immediate complete erasure. Revocation SHALL be described as stopping future access, not recalling delivered data.

#### Scenario: Restore deleted account
- **WHEN** a backup containing deleted personal records is restored
- **THEN** deletion tombstones are applied before any restored record becomes accessible
