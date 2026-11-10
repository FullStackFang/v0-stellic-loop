## ADDED Requirements

### Requirement: Verified identity and explicit enrollment
The system SHALL derive identity from a verified session/token, reject identity overrides, and require an accepted expiring single-use invitation for pilot membership. A link, email domain or newly entered phone number SHALL NOT establish membership or institutional ownership. Root owner verification SHALL be recorded by an identified operator before launch.

#### Scenario: Spoofed subject
- **WHEN** authenticated A supplies B's subject ID with a valid trip link
- **THEN** the system acts only with A's verified authority and returns no B-private data

#### Scenario: Replayed invitation
- **WHEN** a used, expired or wrong-recipient invitation is accepted
- **THEN** no membership or increased role is created

### Requirement: Ownership and tenant isolation
The system SHALL retain portable personal wants under person ownership and organization records under tenant ownership. Storage and services SHALL reject cross-tenant references. Leaving a cohort SHALL revoke cohort access without deleting personal wants or granting organizers access to them.

#### Scenario: Cross-organization resource
- **WHEN** an organization A member submits an organization B resource ID to a write or read
- **THEN** access is denied without exposing B's content or membership

### Requirement: Hierarchical roles
The system SHALL use stable loop IDs and scoped roles owner, organizer, member and follower. Member read, post and commit privileges SHALL inherit downward; organizers SHALL also manage descendant resources and owners alone SHALL delegate organizer authority. Owners and organizers SHALL include member participation privileges in their scope. Followers SHALL inherit read-only access and SHALL not post or commit. Effective access SHALL use all current applicable grants. Child membership SHALL NOT automatically grant parent access. No role SHALL grant another person's private wants.

#### Scenario: Parent member reads child
- **WHEN** a current parent-loop member requests an accessible child document
- **THEN** inherited access permits the read, while a follower's attempt to publish is denied

#### Scenario: Root member participates in child loop
- **WHEN** a root cohort member with no direct Vietnam membership posts or commits in the Vietnam loop
- **THEN** inherited member authority permits the action subject to the activity's normal conditions

#### Scenario: Removed membership
- **WHEN** the last applicable membership is removed
- **THEN** subsequent page, file, search, feed and cached reads are denied

### Requirement: No legacy bypass for pilot data
The system SHALL classify pilot resources explicitly and enforce pilot access through every legacy/new route, action, download, share preview, search and cache. Uploading SHALL NOT auto-enroll a caller. Unrelated public boards SHALL retain their existing behavior.

#### Scenario: Old public URL
- **WHEN** an anonymous visitor uses an old shared-file or OG URL to a migrated pilot resource
- **THEN** neither bytes nor identifying metadata are disclosed
