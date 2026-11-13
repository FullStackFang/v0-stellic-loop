## ADDED Requirements

### Requirement: Shared authenticated adapters
The HTTP API, portal and streamable HTTP MCP adapter SHALL use the same application authorization. Remote MCP SHALL validate issuer, audience, expiry and client with supported OAuth discovery and PKCE behavior. Stdio SHALL bind an explicitly authorized development principal and SHALL NOT bypass production permissions.

#### Scenario: Wrong audience
- **WHEN** a valid token intended for another resource reaches MCP
- **THEN** the request is rejected before accessing Loop data

### Requirement: User-controlled scoped leases
Delegated personal reads/writes SHALL require an active lease bound to the verified person and client, with explicit actions, resource/context scope and expiry. Only first-party member consent SHALL grant/broaden a lease. Revocation SHALL block subsequent outputs, including cached reads and later stream batches. First-party self-service SHALL not require a third-party lease.

#### Scenario: Wrong client or expired grant
- **WHEN** client X uses client Y's lease or a revoked/expired lease
- **THEN** private output is denied even with a valid access token

#### Scenario: Self-expansion
- **WHEN** an assistant requests a broader lease
- **THEN** it receives a member-consent flow and cannot approve its own access

### Requirement: Audit before personal output
Every private-data read, including search previews, resource reads and planning bundles, SHALL persist a minimal actor/client/action/resource/grant/time/outcome audit record before output. The audit SHALL exclude raw content and secrets. Audit failure SHALL fail the read. Export and deletion SHALL remain first-party only.

#### Scenario: Audit unavailable
- **WHEN** a permitted private read cannot persist its audit record
- **THEN** no private response body is released

### Requirement: Confirm consequential actions
An assistant-originated commitment, identity disclosure or publication SHALL require a single-use first-party confirmation bound to the subject, exact payload and target version. Confirmations SHALL expire after ten minutes and SHALL NOT authorize altered payloads. MCP mutation execution SHALL revalidate current identity, client, action lease, role, consent and target version; a confirmation SHALL not substitute for any of these checks. Retrieved content SHALL never grant authority.

#### Scenario: Stale confirmation
- **WHEN** an assistant replays approval against a changed activity or condition payload
- **THEN** execution is denied and fresh review is required

#### Scenario: Lease revoked after approval
- **WHEN** the member approves a proposed mutation but revokes its action lease before execution
- **THEN** the MCP mutation is denied without consuming authority from the former grant

### Requirement: Scoped updates and acknowledgements
Updates SHALL include only currently authorized events and verified announcement metadata with untrusted content separate. Cursors SHALL be scoped to caller/filter context and SHALL not expose global gaps. Agent retrieval SHALL NOT imply human acknowledgement.

#### Scenario: Cursor after removal
- **WHEN** a removed member polls with a previously valid cursor
- **THEN** the response contains no newly unauthorized event, name or payload
