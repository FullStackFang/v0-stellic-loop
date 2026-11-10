# Loop EMBA pilot: hardened architecture and delivery contract

Status: review draft, 2026-11-06. This is a proposed specification, not an implemented capability or an approved stack migration. Three independent reviews covered security/privacy, coordination, and repository architecture. Product choices below are recommended defaults unless explicitly marked open.

Follow-up: reviewed against Living Brain's public developer documentation on 2026-11-06. The architecture is directionally sound, but that review identified missing memory lifecycle and processing contracts, specified below. Public documentation is evidence of the vendor's documented design, not independent verification of its implementation. No Living Brain dependency or service has been installed.

## Product and scope

Pilot with one invited Cornell EMBA cohort of roughly 50–80 members. Help members retrieve trip information, express private preferences, and form activities with conditional commitments. Members control their intent data. Organizers manage the trip and see permitted aggregates, not individual preference profiles.

This direction changes the institutional measurement emphasis in `PIVOT.md`. Do not carry per-student engagement scoring or sensitive inference into the pilot. Historical strategy documents remain historical; this draft does not silently replace them.

Two product surfaces share one core:

- API and MCP: assistant access to authorized information and coordination commands.
- Portal: member participation and consent controls; organizer trip operations.

The portal supports joining, reading updates, expressing interest, committing and withdrawing without an assistant. MCP adds assistant interoperability. Neither surface independently implements authorization or the resolver.

## Repository decision and existing access paths

The supplied build prompt targets a Python `loop-intents` repository that has not been inspected. Do not assert its baseline, compiler behavior or test count. This repository already contains a Next.js app, Postgres migrations, PGlite tests, event patterns, Quorum proposals, and trip pages/files. It also contains a separate `web/` application; that is not automatically the destination portal.

Recommended default: evolve the root TypeScript application and keep one authoritative domain implementation. Inspect the Python prototype before deciding whether to retain it as the authoritative service instead. If retained, the portal calls that service; do not implement the resolver and permission policy twice. Runtime/deployment boundaries may differ without changing ownership of domain logic.

Current trip sharing deliberately permits link access. Review evidence includes `docs/cohort-trip.md`, `lib/trip-store.ts`, `app/api/trip/[slug]/files/[id]/route.ts`, and the trip upload route. Private pilot membership must gate legacy pages, server actions, uploads, downloads, share/OG endpoints, search, caches and feeds as well as new endpoints. A URL or successful login must not confer cohort membership. Do not silently expose or import existing shared data under new privacy claims; define an explicit pilot migration and verify old URLs.

## Shared application boundary

Portal sessions, HTTP bearer tokens and MCP requests produce a server-verified principal. Application services authorize the action, validate tenant/object relationships, execute a transaction, and produce a caller-specific response. Background jobs use explicit service authority, never organizer access to all personal data.

Core modules: identity/access; personal wants; loops/resources; activity coordination; disclosure policy; leases/audit; events/delivery. These can be modules in one application; separate microservices are not required.

Use Postgres as the integration-test source of truth for tenant constraints, transactions and vector retrieval. Reuse the current PGlite harness where supported, but verify PostgreSQL/pgvector-specific behavior against real Postgres. Do not add a second SQLite schema solely for convenience.

## Ownership and domain model

| Entity | Meaning and ownership |
| --- | --- |
| Person | Global identity; not owned by a cohort |
| Organization / membership | Tenant boundary and explicit enrollment |
| Loop / role binding | Stable ID plus human-readable path within an organization |
| Want | Private persistent preference owned by a person; weight, evidence count, last-confirmed time and provenance category |
| Intent | Person's time-boxed expression of interest; sharing scope explicit |
| Activity | Shared proposal with place, timezone-aware interval, deadline and version |
| Commitment | Person's conditional authorization to join a specific activity version |
| Plan version | Immutable resolution result and subsequent lifecycle status |
| Resource / chunk | Organization/loop-owned document, version and citation metadata |
| Announcement | Versioned signed envelope and separate untrusted body |
| Lease | Person-to-client grant with bounded actions, data scope and expiry |
| Audit / outbox delivery | Minimal access evidence and retryable notifications |

Organization-scoped rows carry `org_id` and enforce same-tenant references. Personal wants carry `person_id`; joining an organization does not transfer them to it. Sharing is an explicit scoped relationship. Separate private intent evidence from the shared activity description. No stored conversation excerpts in provenance.

Loop paths are aliases, not authority. Use stable IDs internally. For the pilot, parent membership grants descendant read access; roles can only add privileges within that tree. Restricted children require a later explicit policy model. Followers read but cannot post or commit. Organizers manage scoped resources and activities; only owners delegate organizer authority. No role grants access to another person's private wants.

Before launch, root ownership must be approved by an identified operator with recorded evidence; no such approval has been established by this review. A verified email domain alone is not proof of institutional representation. Invitations are scoped, expiring and single-use, with explicit acceptance; possession of a trip link is insufficient.

## Authentication, leases and audit from the first slice

- Derive the subject from a verified session or access token. Ignore/reject subject and tenant claims supplied in headers, bodies or tool arguments when they attempt to override authority.
- Verify issuer, intended audience, expiry and authorized client. Account sign-in and third-party OAuth delegation are separate flows. Use an established authorization implementation, not bespoke token issuance.
- Implement remote MCP protected-resource discovery and interoperable OAuth behavior against a pinned supported specification. Validate PKCE and resource/audience binding; never accept arbitrary upstream tokens as Loop credentials. Keep stdio development explicitly bound to a test or locally authorized principal.
- Bind leases to the authenticated client identity and person. An `agent_id` parameter is not proof of identity. Effective authority is the intersection of identity, role, OAuth scopes, lease actions/resources, consent and current membership.
- Every delegated personal-data read, including `plan_for_me`, search previews, caches and streams, checks its active lease and commits a minimal audit record before releasing data. Export is first-party only for the pilot. Fail closed if required audit persistence fails. Recheck access for later pages and delivery batches.
- First-party self-service reads use the member's authenticated session and are audited; they do not require granting a third-party lease. An agent cannot use that exception. Revocation/expiry blocks subsequent reads, including already-open sessions, and never promises to retract previous disclosures.
- Granting or broadening a lease requires a first-party consent screen. MCP may propose a grant but cannot approve its own authority. Deletion, identity disclosure and consequential commitments require explicit, version-bound confirmation rather than instructions embedded in retrieved content.
- Audit records contain who/client, action, resource IDs, grant ID, time and outcome, not preference values, document bodies, credentials or raw prompts. Record rejected access minimally without leaking another person's resource existence.

Replace “agents never get a copy” with: “Loop releases only consented data under bounded access; revocation stops future access. An assistant provider may retain previously received data under its own policies.”

## Content, documents and crisis boundary

Store organizer-authored documents and announcements as intentional published content; these are distinct from raw assistant conversations. Raw conversation input is transient, compiled and discarded across database, logs, traces, errors, queues and analytics. An external compiler receives only the minimum input under an explicitly selected data-processing policy. Prefer structured assistant submissions where practical.

Never persist crisis signals in wants, vectors, matching, group events, analytics or organizer views. Route the individual to a support response only; do not claim a classifier detects every crisis. No emergent grouping or labels from health, identity, finances or inferred sensitive traits. Pilot discovery uses explicit allowed activity/place/time/course categories; no autonomous semantic clustering.

Validate document type and size, process in bounded jobs, and expose upload/processing/failure status. Authorize source rows before retrieval and reauthorize returned citations/downloads. Resource removal or membership revocation invalidates derived search and cached access. Citations include document/version, page or section, passage and accessible source link. No supported passage means no fabricated answer. Preserve timezone and itinerary revision when answering “what time is the bus?”

Return document and announcement bodies only in clearly designated `untrusted_content`, with server-verified metadata separate. User-authored titles, filenames, labels, summaries and compiled preference text remain untrusted too; signing or compilation never promotes them into instructions. Content cannot alter scopes, destinations, tool definitions or permissions, and ingestion never executes embedded commands or follows embedded URLs automatically. Test the server guarantee; do not claim control over every external assistant's reasoning.

Sign canonical announcement envelopes containing org/loop ID, announcement ID, version, timestamp, key ID and body digest. Verify signer authorization at publication, retain key history, and define rotation, compromise and correction behavior. Published revisions are immutable. Signing-key custody is an explicit deployment decision; a server-held organizer key proves service-attested authorship, not a personal cryptographic signature. A valid signature does not make content trustworthy instructions.

## Coordination and disclosure

Revocation must not weaken a commitment: if consent for a required person is revoked, suspend the dependent commitment pending a new explicit choice. Never simply drop its `requires` constraint and treat the remaining, easier conditions as authorized. A consented dependency may refer to an eligible member who has not opted in yet; that commitment remains unmet until the person actually joins. Creation must not disclose whether they have joined.

The candidate set contains active, eligible opt-ins for the same activity version. `min_others` is a validated nonnegative integer excluding self. `requires` contains distinct eligible person IDs, no self-reference, and is permitted only after the named person has explicitly consented to participation disclosure to that requester for this activity. Otherwise reject generically; do not offer a hidden-person membership oracle.

For a fixed snapshot, start with all candidates and repeatedly remove people whose minimum or required-person conditions fail. Stop at the fixed point. This returns the greatest feasible subset for these monotone predicates, including mutually dependent cycles. Empty results are valid. Capacity limits, budget optimization, negative conditions and choosing among conflicting activities are outside this resolver and deferred.

Recommended pilot contract: committing means “include me if my conditions hold at the deadline for these exact details.” Finalize once at the deadline in a transaction that checks activity version and current commitments. An edit to time/place/conditions invalidates affected authorization and requests renewed commitment. Store the resolved set and notification outbox atomically. This forms a social plan, never a booking or payment.

Before finalization, withdrawals affect the candidate set. After finalization, preserve history, recompute the remaining feasible set, mark the plan degraded when commitments no longer satisfy conditions, and notify affected members to reconfirm or cancel. Keep a condition failure distinct from a voluntary withdrawal. Freeze new joins at the deadline; reopening or reconfirming creates a new activity revision requiring fresh opt-in. Do not silently recruit replacements or assert continued satisfaction. Revoking named-dependency disclosure consent invalidates that dependency and requests private action without exposing the target's participation. Self-service feedback is opt-in and updates want weights once per person/event; neither nonattendance nor no answer implies dislike. Only an explicit preference assessment adjusts preference strength.

Separate participant coordination from organizer analytics:

- Show a member their own state. Names require activity-specific affirmative disclosure consent; mere overlapping interest does not imply consent. Participant rosters are authorized operational views, not organizer analytics.
- For the pilot, restrict live social proof to a coarse formation status without exact counts. Status still reveals some coordination information; disclose that limitation during commitment. Do not promise formal anonymity.
- Organizer analytics use a frozen close-of-activity partition with no arbitrary filters or overlapping live query windows. Suppress cells below five and any complementary totals that recover them. A suppression marker must not distinguish zero from a small positive cell. Maintain released-output consistency; do not publish a changing series that exposes one-person deltas.
- The eight-person/six-confirmed demo must suppress numeric analytics and show a permitted nonnumeric status. A separate fixture with ten interested, five confirmed and five unconfirmed can demonstrate numeric release, provided no other released totals undermine it.

Notification means every resolved recipient's inbox entry is committed together. External delivery, if later enabled, is asynchronous, retryable and idempotent, with per-recipient failure status; simultaneous receipt is not guaranteed. Pilot default is portal inbox plus authorized MCP polling. Notifications reference a resolution version; suppress obsolete pending delivery and render current authorized state when opened. Cursors are bound to caller/filter context and do not reveal global event gaps or unauthorized payloads. Revocation changes what can be fetched, even using an old cursor.

## Portal scope

`plan_for_me(place, start, end)` is a read-only context bundle: the caller's relevant active wants, authorized resource passages with citations, and published activities overlapping the requested place/time. It returns structured data with source IDs and timezone-aware intervals, not conversation history, an autonomous itinerary, a booking or a commitment. Use explicit context/tag and interval matching for the pilot; unspecified preferences remain unknown. The assistant composes the proposed itinerary from that bundle.

Members and organizers may create activities in loops where they can post; followers cannot. Compiling text proposes structured want/intent fields for the member to review. Saving a private want, sharing an intent, publishing an activity and committing are separate explicit actions. Compilation alone performs none of the latter three. No inferred preference automatically publishes an activity or enrolls its owner.

Activity lifecycle is draft, open, finalized, then completed or cancelled; a finalized plan can additionally be degraded. The activity creator or scoped organizer can cancel, with a reason visible to affected participants and an inbox update. Any participant can withdraw only their own commitment. A materially revised or reopened activity is a fresh open revision with a new deadline and fresh commitments; it can finalize once independently of historical revisions. Completion is a time/lifecycle marker, not proof of attendance.

Member routes cover invitation/sign-in, trip overview and cited resources, activities/commitments, private wants, feedback, assistant connections/consent, access history, and export/delete. Show what information will be shared before committing. Use local activity time with timezone labels and handle travel across countries.

Organizer routes cover loop structure, invitations and roles, document processing, announcements/corrections, activity deadlines/status, permitted analytics and operational failures. There is no member preference browser, sensitive segmentation, individual engagement score or organizer access to member audit history. Operator diagnostics use redacted technical metadata.

The builder can choose visual layout using existing app patterns. Mobile usability, expired links, revoked access, empty states, failed uploads, stale versions and retry states are acceptance requirements. Do not expose implementation terminology where plain language works.

## Export, deletion and retention

Define one inventory covering personal records, memberships, leases, embeddings, uploaded files, derived caches, jobs and backups. Export only the requester's authorized personal data, not other participants' records. Require first-party reauthentication for export/delete. Deletion revokes access immediately and removes live personal data/derived copies; retained minimal audit records and backup expiration must have a documented duration and user-facing explanation. Restoring backups must reapply deletion tombstones. Do not promise “delete everything immediately” while retaining recoverable backups.

Exact retention durations and organization-owned publication attribution after account deletion remain a policy decision before real-data launch.

Account deletion also withdraws active commitments, revokes disclosure consent and runs the same degradation/notification flow as withdrawal. Remove direct participant identifiers from retained plan history and remove private dependency edges; retain only nonidentifying lifecycle facts where needed. Do not preserve a stable pseudonym that lets organizers reconstruct a deleted person's participation. Pending jobs and restored backups must apply the deletion before exposing results.

## Delivery slices and verification

1. Baseline and authority decision: inspect the selected codebase(s), run their actual tests/demo, inventory existing access paths, and record authoritative service choice. No assumed 16-test baseline.
2. Secure vertical slice: verified identity, invite-only membership, same-tenant constraints, shared authorization, leases/audit, member sign-in/consent and one authorized MCP read. Verify real Claude and ChatGPT accounts early, recording client/version/date.
3. Trip information: loop roles, organizer upload/announcement, member resource view and cited MCP answer. Verify unauthorized citations/downloads, revoked access and injection fixtures across old and new routes.
4. Coordination: versioned activity, member opt-in/withdrawal, fixed-point finalization, inbox and safe organizer view. Verify concurrent changes and duplicate requests.
5. Personal planning: editable wants, contextual `plan_for_me`, idempotent feedback, export/delete, retention jobs. Exercise the complete lifecycle with one member and a separate unauthorized account.
6. Pilot rehearsal: run the full demo locally and against the remote MCP server; run actual portal and client walkthroughs. Document deployment/migrations, rollback, connectors and data boundary. No production build for this document-only review.

Test gates include cross-user and cross-tenant object access; spoofed subject/client IDs; expired/wrong-audience tokens; role inheritance and removal; lease scope/expiry/revocation including cache hits and streams; failed audit writes; raw text canaries in storage/logs; crisis exclusion; malicious documents; signing/version tampering; stale citations; resolver chains/cycles and exhaustive small-set comparison; concurrency/idempotency; withdrawal after resolution; name-consent enforcement; complementary suppression and repeated-output inference; cursor authorization; deletion across derived data and backup restoration.

Each implementation slice ends with focused tests and a factual summary. Run a final production build only if shipped app code changed, with no competing dev/build process. Do not declare remote connector success from a synthetic HTTP test alone.

## Decisions to settle before implementation

1. Authoritative backend: recommended root TypeScript application, contingent on inspecting the separate Python prototype. Existing `web/` is not assumed to be the new portal.
2. Approve the pilot defaults: portal participation, explicit named-person disclosure consent, conditional preauthorization at a deadline, no exact live analytics, inbox/polling notifications.
3. Choose authentication/delegation and signing-key custody after compatibility checks, using existing integrations where appropriate. No service was provisioned in this review.
4. Confirm retention periods, pilot owner verification and the treatment of authored organization content on deletion before onboarding real people.

## Protocol references checked during review

- [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization): resource-server responsibilities and authorization discovery; pin supported behavior during implementation.
- [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth): host OAuth integration guidance; validate against the intended ChatGPT account.
- [Claude remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): remote connectivity and setup; a local stdio demo does not establish remote-client compatibility.

These references inform connector requirements, not proof that a connector has been implemented or tested here.

## Living Brain architecture review and adopted requirements

### Assessment

Living Brain documents a compilation pipeline that produces versioned, source-linked knowledge, with separate indexing and retrieval. This supports the split between durable records and assistant-facing context. Its documented partial-failure behavior also shows why “saved” and “searchable” need distinct states. Loop will retain typed wants and intents as canonical records rather than adopt generated Markdown pages as transactional truth. [Core concepts](https://docs.livingbrain.com/docs/concepts)

Its policies separate retention, placement, linking and resurfacing, with permission checks before scoring. Loop should make those decisions explicit without copying unpublished scoring formulas or adding a graph engine for this pilot. A relevant preference is neither verified truth nor permission to act. [Design policies](https://docs.livingbrain.com/docs/design-policies)

### Memory lifecycle

These are Loop-specific requirements, not claims about Living Brain implementation:

- A want has a stable ID, version, explicit context, confirmation time and lifecycle state: proposed, active, needs_review, superseded or archived. A compiler proposal requires the person's acceptance before becoming durable active preference data. Reject crisis material before creating even a proposed record.
- Separate preference strength, extraction confidence, unique evidence count and retrieval relevance. Reads, retries and repeated assistant paraphrases cannot strengthen a preference or count as new evidence.
- Use person/context-scoped operation IDs for idempotency. Do not put conversation text or source-system secrets in those IDs. Store minimal structured evidence and compiler version; do not retain raw chat as provenance.
- Explicit member corrections create a new version and supersede the old statement. An inferred contradiction becomes a review item; it cannot silently overwrite a correction. A temporary trip preference does not replace a global preference. Ambiguous placement remains separate pending review.
- Review-needed, superseded and archived preferences are excluded from ordinary planning. Lack of use may prompt reconfirmation but does not imply dislike. Any configurable staleness rule must be visible and tested; no invented universal decay constant.
- Use version checks on updates so parallel assistants cannot overwrite newer decisions. Concurrent conflicting updates return a conflict requiring a fresh read.

### Processing and retrieval

Raw chat compilation happens transiently within the request. Persist only accepted structured output; on interruption before acceptance, the caller retries. Durable workers may process deliberately uploaded documents or already accepted structured records, never queued raw conversation payloads. Document ingestion tracks acceptance, extraction, indexing and failure separately. An indexing retry must not duplicate canonical records or evidence. Reject late worker output for an obsolete version, deleted source or revoked authority.

Living Brain documents combining keyword and semantic retrieval, and cautions that vector similarity is not correctness. For Loop, apply authorization and context filters to both retrieval paths before ranking. Preserve exact dates, names and identifiers; use vector search as a complement. Enforce a response budget and report truncation, source versions and indexing state. [Search ranking](https://docs.livingbrain.com/docs/search-ranking)

Return supporting passages with sufficient surrounding context, not a similarity score presented as an answer. Conflicting bus times remain disputed unless an authorized correction explicitly supersedes an earlier source. If evidence is unavailable, stale or contradictory, return that status with citations instead of guessing. These requirements adapt the documented distinction between retrieving material and deciding whether it supports an answer. [Build guidance](https://docs.livingbrain.com/docs/build)

Any summary or contextual bundle inherits restrictions from every source it includes. Private wants must not be merged into shared loop summaries. Removal of a source invalidates derived passages, indexes and summaries; rebuild from remaining authorized sources before serving them. Preserve no inaccessible source titles or counts in the response. The portal should expose personal corrections to the member and document-processing/conflict states to authorized organizers, without a speculative “brain health” score.

### Important differences from Living Brain

Living Brain's application API documents an organization-wide server credential and a subject selected by the backend; it explicitly says to keep the key out of browsers. That is a trusted backend delegation model, not evidence that arbitrary clients should choose their own identity. Loop's assistant endpoint still requires verified user OAuth and leases. If any backend provider is adopted later, only Loop derives its subject from authenticated identity. [Authentication](https://docs.livingbrain.com/docs/authentication)

Living Brain separately documents account-based OAuth MCP with distinct read/search/capture scopes. That validates treating consumer assistant access separately from a backend API key, but does not establish Loop's lease semantics or cohort permissions. [MCP sign-in](https://docs.livingbrain.com/mcp/sign-in)

Its capture guidance accepts conversation turns and says removing a source leaves derived pages intact. Neither behavior is Loop's default: no automatic conversation retention, and deletion must propagate through derived data. Retention of provenance is limited to permitted structured evidence and intentional document uploads. [Capture behavior](https://docs.livingbrain.com/docs/capturing)

Keep machine synchronization cursors, notification-delivery status and human-read acknowledgement separate. Reading `get_updates` must not mark an announcement as seen by the person. This follows the useful distinction in Living Brain's change-feed documentation without adding external webhooks to the pilot. [Change feed](https://docs.livingbrain.com/docs/changes)

### Added acceptance cases

Verify correction versus concurrent compile; context-specific versus global preferences; duplicate evidence; archived/contested preference exclusion; indexing failure after canonical save; retry after partial failure; stale-worker rejection; source-deletion propagation; permission-safe keyword/vector results and previews; malicious titles and summaries; revoked dependency consent without weakened conditions; and agent fetch versus human acknowledgement. Evaluate these using Loop-specific fixtures, not another product's benchmark scores.
