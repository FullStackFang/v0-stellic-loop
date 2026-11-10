## ADDED Requirements

### Requirement: Group-only context service
Group-context tools SHALL return only currently authorized shared records, cited sources, announcement verification metadata and existing privacy-safe activity projections for one exact group. They SHALL NOT call personal-memory retrieval, pool member preferences or expose new private participant names/counts. Search SHALL be bounded to 20 items and output to 32 KiB with explicit version, conflict, invalidation and truncation information. `plan_for_me` SHALL remain a distinct personal-context tool.

#### Scenario: Private-memory canary
- **WHEN** a group-context request would be more relevant using a member's private preference
- **THEN** no private text, inference, title, count or evidence from that preference enters the group result

### Requirement: Current authorization and evidence
Every delegated context/read/search request SHALL enforce identity, client scope, exact-scoped lease, membership and source permissions, persist minimal audit before output, and refresh current versions/dependencies. HTTP responses SHALL be no-store. Previously resolved addresses and previously opened sessions SHALL NOT retain authorization. Corrections and revocation SHALL govern subsequent service calls, without promising deletion of content retained by hosts.

#### Scenario: Client-specific revocation
- **WHEN** a member revokes Claude's group grant while retaining ChatGPT's independently granted access
- **THEN** subsequent Claude reads and writes fail while authorized ChatGPT reads still return current records

### Requirement: Honest host and audience boundaries
The initial experience SHALL support connected one-to-one assistant conversations with explicit consent to disclosure to each host. Tool arguments claiming an audience or private room SHALL NOT establish trusted recipients. The system SHALL NOT claim native cross-host `@` interception or safe group-room delivery. Unsupported group broadcasts and external representation SHALL produce no effect and explain the unsupported capability. Host setup SHALL direct users to first-party access when the intended private output surface cannot be established.

#### Scenario: User asks to contact the cohort or hotel
- **WHEN** a prompt asks Loop to message everyone or accept terms on behalf of the cohort
- **THEN** this slice performs no external delivery or binding action and distinguishes drafting from unsupported execution

### Requirement: One canonical memory across separately authorized clients
Portal, HTTP and MCP SHALL share application services and canonical record/version IDs. Each host SHALL authenticate and obtain consent separately; account linking SHALL use verified identity, never caller-selected person IDs or unverified email. The tools specified in design.md SHALL expose structured inputs/results and distinguish private memory from group memory. Client provenance SHALL remain visible without treating the client as the author.

#### Scenario: Save in Claude and retrieve in ChatGPT
- **WHEN** the same verified member publishes an approved group record through Claude and then asks ChatGPT for a fresh read
- **THEN** ChatGPT returns the same canonical ID/version and authorized attribution, not a separately copied memory

### Requirement: Actual cross-host acceptance
Release evidence SHALL record actual intended Claude and ChatGPT account/plan eligibility, client IDs, date, provider discovery/audience/PKCE results and observed tool behavior. The demo SHALL cover reviewed publish in one host, fresh retrieval and correction in the other, current reread, stale-write denial, unauthorized-user denial, independent client revocation, and private/shared isolation. Synthetic two-client tests SHALL be labeled synthetic and SHALL NOT satisfy this real-host gate.

#### Scenario: Host cannot complete a supported flow
- **WHEN** a real host cannot connect, obtain the required identity/scopes or execute the reviewed workflow
- **THEN** the acceptance report records the limitation and does not declare cross-host completion or replace it with a fixture result
