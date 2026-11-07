## Context

The intended experience is one group identity and memory accessible from private conversations in ChatGPT and Claude. `@emba2027` is a human reference to a group, not a new OAuth identity, permission grant or guarantee of native host autocomplete. User direction is to take inspiration from Living Brain's persistent, cross-assistant memory while adding explicit group membership and collective-action boundaries.

The root pilot already implements stable organization/loop IDs, inherited roles, personal Want/Intent versions, reviewed personal candidates, audited leases, exact single-use confirmations, versioned documents, announcements and activities. `planForMe` explicitly combines the caller's personal wants with group evidence. `saveMemory` and candidate review currently require first-party authority. MCP currently provides read tools and confirmed activity/disclosure mutations, not a conversational shared-memory service. Production browser sign-in and remote host compatibility remain unfinished.

This change depends on `loop-emba-intent-platform`; its 37/51 completion snapshot is unchanged. Existing private-memory, source-invalidation, no-raw-conversation, publication-confirmation and release-policy requirements remain binding. Archive the foundation before this dependent change; do not replace its pending compiler/vector/auth tasks with synthetic acceptance here.

## Goals / Non-Goals

**Goals:** Address an authorized group by name; submit bounded structured memories from an assistant; explicitly publish shared notes and organizer-attested decisions; retrieve and correct the same canonical record from another assistant; preserve private/group separation, provenance and revocation.

**Non-Goals:** A new chat application; universal `@` interception; automatic transcript capture; raw-chat compilation/model provisioning; vector search as a prerequisite; a knowledge graph engine; group-chat bots or automatic external messaging; inferred group consensus; institutional identity verification from a handle; bookings or representation of a cohort to third parties. Unsupported requests return a capability explanation without an effect. No Living Brain SDK/service is selected.

## Decisions

### 1. Add group addresses over the existing authorization model

Use the existing organization/loop tuple as canonical group identity. Add a globally unique organization namespace and a namespace-local group slug, both normalized lowercase ASCII: `[a-z0-9][a-z0-9-]{1,47}`. Canonical reference is `@<namespace>/<slug>`; `@emba2027` is a short alias resolved only among groups visible to this caller/client. Do not derive permissions or tree ancestry from strings. A root owner manages addresses; initial namespace reservation follows the same trusted owner-provisioning path and unresolved verification gate as cohort creation. Display the managing cohort without claiming official university endorsement.

For this slice, addresses are immutable after creation, retired rather than reused, and backed by stable IDs. Handle renaming/alias migration is deferred. Enforce uniqueness in PostgreSQL, not a check-before-insert. Self-asserted affiliations grant nothing; membership continues to come from existing verified invitations. People can belong to multiple independent groups; naming two groups never merges grants or audiences.

Discovery avoids a consent bootstrap exception: first-party portal membership selection uses existing authorized loop listing. `list_groups`/`resolve_group` expose only minimal IDs, addresses and display labels for groups with current membership, token `plan:read`, and a current exact-scoped `plan:read` lease for this client. No private directory, hidden-match counts, roster or activity counts are exposed. If a group is not found or not granted, return the same unavailable result plus a generic first-party connections path. Ambiguity is reported only among authorized matches. Recheck membership/grants and audit before returning.

Alternative rejected: global public handle search or creating a separate MCP installation/agent for each group. One Loop connection can serve many separately consented groups.

### 2. Add shared records, not group-owned personal Wants

Add a separate shared-memory identity/version/operation/dependency model with composite same-tenant references. Canonical fields: stable ID; org/loop; current version; kind (`note`, `proposal`, `question`, `decision`); text; author; approver when applicable; publication time; status (`active`, `superseded`, `withdrawn`, `needs_review`); structured provenance and source-version dependencies. A proposal here is an explicitly published group suggestion, not an unaccepted assistant candidate. Keep first-party author identity separate from assistant client attribution. Text is bounded to 2,000 characters, candidates to 8 KiB encoded JSON, and source dependencies to 8. Personal candidates retain their existing stricter schema.

Members with `post` can publish notes/proposals/questions and correct or withdraw their own non-decision records while still authorized. Organizers with `manage` can moderate all group records. Any mutation of a current decision, including correction, withdrawal or demotion to another kind, requires `manage` regardless of the original author. A decision is labeled "recorded by organizer", with approver and date; it never claims a cohort vote, unanimous consent, institutional endorsement or authority to bind people. Changing a note into a decision requires organizer approval and a new version. Followers read only. Private memory is never selected as a group source or bulk imported into group memory.

Each correction compares the expected version and appends immutable history; ordinary retrieval returns current active versions only. Exact operation retry is idempotent; changed payload under the same operation ID conflicts. Distinct suggestions remain distinct unless explicitly corrected; similarity alone never merges or promotes them. Source refs accept existing authorized document/version or shared-memory/version IDs in the same exact loop; arbitrary URLs, assistant-provided quotes and hidden/cross-group sources are not verified provenance. Author-reviewed unsourced notes are allowed and labeled as member submissions.

Version dependencies form an acyclic graph: reject self/cyclic references and any candidate exceeding 8 dependency levels or 64 unique transitive source versions. Revalidate this bound on correction; do not silently truncate required dependencies. A source correction, withdrawal or deletion invalidates dependent summaries/claims transitively before their next output; stale items become `needs_review`, retaining no accessible removed-source snippets. A rebuild requires fresh authorized publication. A source ref does not itself grant access; reads check every dependency. Use deterministic lock ordering consistent with existing source/privacy transactions and exercise concurrent invalidation on native PostgreSQL.

Alternative rejected: generated Markdown as transactional truth or folding group statements into `emba_memory`, which is explicitly person-owned.

### 3. Structured conversational capture first

The connected host assistant proposes structured content from the user's request. Loop does not receive a transcript, pass raw chat to another model, or operate an automatic conversation compiler in this slice. A member intentionally publishing a short note is a publication, not permission to archive the surrounding conversation. Strict tool schemas reject transcript/history/message arrays, arbitrary provenance fields and oversized payloads. Candidate text remains untrusted; preparation has no publication, commitment, notification or affiliation effect. Minimize request/error telemetry; never log candidate content.

Personal candidates continue through the existing first-party review/save path; ordinary delegated `memory:write` does not bypass `requireFirstParty`. Group candidates use new prepare/execute operations with action `group_memory_publication` (including correction/withdrawal intent), an explicit `group-memory:write` token scope and lease, and a first-party confirmation. Existing `activity:write` grants do not authorize it. Update persisted enum/check constraints, validators, UI choices and action-count bounds together; do not silently upgrade existing leases. Reads use existing scoped `plan:read`.

Preparation validates role, shape, dependencies and expected version and returns the exact candidate plus generic `/emba` review path; it stores no candidate body. The baseline host-independent bridge is copy/paste of the structured candidate into an authenticated first-party review form, following the existing personal proposal UI. The form shows destination, audience, kind, exact text, sources, proposed changes, decision authority and the originating assistant connection. Resolve client identity from trusted server/provider configuration and current scoped consent for this member; display the verified client ID and a configured friendly name if available, never an assistant-supplied label. Reject unknown/disallowed clients and revoked, expired or wrong-scope group-write leases before approval. First-party review validates consent for the chosen client; execution still validates the actual bearer token and its current scopes. It approves the canonical payload hash for that client/person/action/group/record/version for ten minutes. New records use a preassigned random UUID and expected initial version 1; operation ID and mutation kind are part of the hash. The portal returns the confirmation ID for the user to give the originating assistant. No payload, token or confirmation is embedded in a URL. A host UI can later improve this bridge without changing the protocol.

Execution consumes confirmation and writes in one transaction, rechecking current identity, exact client/scopes/lease, role, group, dependencies and version. A successful write stores an operation receipt: exact retry from the same still-authorized client/person returns a minimal receipt containing only operation ID, record ID, committed version and current lifecycle status, without re-consuming approval or returning old text, snippets or source metadata; changed/replayed payload, different client or expired/revoked access is denied. It never creates a second version. If the record was subsequently corrected, invalidated or withdrawn, the receipt identifies the committed version and current lifecycle without resurfacing its content; new content retrieval must use ordinary read authorization. Retry behavior is new to this operation; do not weaken replay protection of existing activity confirmations. Review of a personal candidate cannot approve group publication. Assistant text saying "approved" never substitutes for a first-party confirmation.

Alternative rejected: persist every assistant draft or rely on chat text alone as first-party approval. This adds friction but reuses an explicit, testable consent boundary before native host UI integration.

### 4. Separate group context from personal context

Add `get_group_context`/`search_group_memory`/`read_group_memory` over one exact group. Return only authorized shared memory, accessible cited documents, announcements with verification status and existing privacy-safe activity projections. Do not call `listMemory` or `planForMe`, accept a list of people, expose private wants, infer group preferences from them, or add participant counts/names. Keyword retrieval is sufficient for the first vertical slice; semantic ranking remains the foundation's separate provider/vector task. Bound search to 20 items and 32 KiB with explicit truncation, conflicts, pending/invalidated evidence and version/source references. Handle input is resolved first; all execution and confirmation bind stable IDs.

`plan_for_me` remains private-personal and is labeled accordingly. The demo supports user-configured one-to-one assistant conversations. OAuth authenticates the caller/client, not who can see the chat. A model-supplied `audience` or `private=true` is never trusted as a recipient attestation. Users explicitly consent to disclosure to that host; Loop cannot prevent copying or later chat sharing and must not claim it can. No shared-room delivery endpoint is exposed in this slice. A future chat adapter requires independently verified destination/audience authorization; group-only retrieval by itself is not permission to post its result into any room. Where a private output surface cannot be established operationally, guide the user to the authenticated portal instead of promising audience-safe delivery.

No long-lived content cache is needed for this slice. Reauthorize and audit each read/output and citation, refresh current versions and invalidations, and use no-store HTTP responses. Cached handle IDs carry no authorization. Host models may retain earlier responses; revocation/correction governs subsequent Loop calls and cannot force a host to forget. Demo instructions explicitly request fresh tool reads after a change.

### 5. Minimal portable tool contract

Tool names are the intended contract, with strict schemas and annotations: `list_groups` (bounded authorized directory); `resolve_group` (address to stable ID); `get_group_context`; `search_group_memory`; `read_group_memory` (current by default, authorized history explicitly); `prepare_group_memory`; `execute_group_memory`. Existing personal review and private planning remain distinct. Structured errors distinguish conflict/invalid input from generic unavailable without disclosing hidden resources. Provide the same service behavior through portal and HTTP where needed, not a second business implementation.

Conversational examples use "Using Loop, what did @emba2027 decide?" or explicit host app selection. `@emba2027` is application data, not a promise to install a native mention in either host. Each host obtains its own authenticated client and consent; provider subjects map to the same internal person only via verified account linking, never unverified email or tool-supplied IDs. No bearer token is copied between hosts.

### 6. Lifecycle and existing-work integration

Extend personal export/deletion and restore rehearsals to account for new operation receipts, author/approver references and dependent records. Private candidate bodies are not stored before acceptance; approved shared publications are organization-owned. Do not cascade-delete group decisions merely because an author leaves. Exact retained attribution/history/backup policy remains the foundation's enrollment gate. While unresolved, keep these behaviors explicitly documented and synthetic-only; do not promise complete erasure. Withdrawal denies content through current, historical, search and derived endpoints, while internal retention follows the eventual policy. Operations/audit contain minimal IDs/hashes, not raw text.

New migrations must preserve unrelated public boards, existing personal memory and lease semantics. No graph database, provider SDK, new backend runtime or general chat store is needed.

## Risks / Trade-offs

- Ambiguous group names -> authorized resolution and canonical display before any write; no automatic selection.
- Private/shared confusion -> separate stores, tools and review actions; scoped personal wants remain personal.
- Suggestion misrepresented as consensus -> distinct kinds and organizer attestation, never inferred agreement.
- Stale host answers -> versions and fresh tool reads; no claim to recall already delivered content.
- Host audience cannot be proven by MCP -> one-to-one demo boundary and explicit host consent; shared-room delivery deferred.
- Review bridge adds steps -> prove portable semantics with existing browser review before host-specific UI work.
- Cyclic/obsolete source references -> acyclic version dependencies, transitive invalidation and real-Postgres race tests.

## Migration Plan

1. Implement and verify address/shared-memory schema and services on disposable databases; leave existing foundation task status unchanged.
2. Add exact-scoped consent/actions and review UI, then MCP/HTTP parity and deterministic two-client tests. Reuse installed libraries and read installed Next.js guides before code changes.
3. Resolve provider/host compatibility through the existing auth spike. Implement real browser sign-in, verified linking and separate client consent; do not deploy a test-session bypass.
4. Apply all foundation and new migrations to an isolated demo database before deploying to the linked Vercel project or a deliberate preview. Configure only synthetic demo identities/content until policy gates close.
5. Run actual Claude and ChatGPT acceptance. Disable the new tools/ingress on rollback while preserving private classification, stored permissions and migrations; never revert to public legacy access.

## Open Questions

Provider/project/accounts, production signer/worker custody and exact retention/attribution policies are existing deferred decisions. They block their dependent live integrations/enrollment, not local services or synthetic tests. No new provider is selected here. The builder may choose filenames and indexing details within these contracts. Future group-chat delivery and external representative authority need separate designs; this change returns unsupported for those requests.

## Inspiration and evidence

Living Brain's documented capture/compiled knowledge/MCP access informs persistence and cross-host retrieval, not an assertion of equivalent behavior or an installed dependency: https://docs.livingbrain.com/. Host capability references: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt and https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp. Recheck exact account and host behavior during implementation; documentation is not acceptance evidence.
