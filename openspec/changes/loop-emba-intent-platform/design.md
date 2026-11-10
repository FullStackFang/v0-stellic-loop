## Context

One invited EMBA cohort needs trip information and conditional activity formation through personal assistants and a mobile-friendly portal. The root app already has Next.js, Postgres, PGlite tests, trip resources and event patterns. Current sharing is deliberately link-based and is unsuitable for private pilot data. The separate `web/` campus product and Python prototype are not the implementation target.

This design operationalizes `docs/loop-emba-mvp-hardening.md`, including the Living Brain review. Capability specifications in this change are the acceptance contract. Existing public-board specifications remain applicable outside the explicitly classified pilot domain.

## Goals / Non-Goals

**Goals:** One authoritative core; verified membership; member-owned memory; consented assistant access; cited trip knowledge; deterministic conditional commitments; safe organizer views; reliable inbox; deletion and correction lifecycle; real-client pilot verification.

**Non-Goals:** General-purpose conversation storage, a knowledge graph platform, individual engagement scores, payments/bookings, capacity optimization, cross-activity scheduling, arbitrary analytics, automatic sensitive clustering, external push channels, a Python rewrite or consolidation with `web/`.

## Decisions

### Provider administration and bounded demo (reviewed 2026-11-08)

Provider choice and Marketplace provisioning are separate decisions. On November 9 the user chose to retain Vercel Marketplace for consistent provisioning, billing and production scaling, superseding the November 8 direct-ownership recommendation. Reuse the existing Clerk integration and shared Supabase project; do not initiate ownership transfers. The unused FullstackFang Direct organization has been removed. See `docs/emba-provider-ownership-review.md` for the comparison and `docs/marketplace-exit.md` for the cancelled transfer plan and cleanup evidence.

Keep Clerk as the current identity/OAuth adapter because its custom scopes and public-client controls fit the delegated-access contract. Loop retains group roles and consent in its own services; Clerk Organizations are not required. Supabase OAuth is a candidate only after proving equivalent permissions and project-wide isolation: current documentation does not support custom application scopes. A shared database schema does not isolate the project's Auth settings or user pool. Changing shared Auth configuration requires reviewing other app consumers.

Operator acceptance must identify the actual workspace/application/environment, dashboard entry point, billing owner, settings authority and environment-variable source. Provisioning success alone does not establish usable operator access. Record these within task 1.3, alongside actual host compatibility evidence.

The bounded shared-memory demo uses email verification or Google login, explicit invitation membership, one assistant connection, exact-group consent, reviewed notes, retrieval and revocation. Members never configure provider scopes or developer accounts. Raw-chat compilation and embeddings remain outside this demo; the broader foundation tasks and real-member launch gates retain their existing requirements. This review changes documentation, not provider resources or deployed settings.

### One root TypeScript service layer

Use application services shared by server-rendered portal/actions, HTTP routes and MCP adapters. Portal calls may be in-process; internal HTTP is not required. Separate modules for access, personal memory, knowledge, coordination, disclosure and delivery. One Postgres database with explicit ownership and tenant constraints. Reuse existing primitives after review; never infer authorization from the current global-person or public-sharing models.

Alternative: a Python service plus TypeScript portal. This adds deployment and identity boundaries without verified reuse benefits. The builder can inspect the prototype for compiler behavior and test fixtures if supplied, but it does not block this design. Any later runtime change needs an explicit amended decision.

### Identity and ownership

Personal wants belong to a global person. Organization membership grants access only to organization-scoped resources. Stable loop IDs own paths; organization-scoped references enforce same-tenant relationships. Explicit invitations grant a role after verified sign-in. Parent read membership inherits down; inherited organizer authority manages descendant resources, while only owners delegate organizer roles. Child membership alone does not expose parent resources unless separately granted. Private subtrees are deferred; users see the inheritance rule before publishing.

Member participation privileges inherit downward alongside read access: a root member can post and commit in Vietnam/Estonia without joining each child separately. Followers inherit read-only privileges. Owners and organizers also have member participation privileges within their scope. Effective eligibility uses the strongest currently applicable role; removing a direct child role does not remove a still-valid inherited grant.

Authentication and delegation use a supported provider/library selected by a compatibility spike, not homemade OAuth. A validated identity maps to the internal person. Public inputs never select authority. Personal self-service requires no organization membership; organization-context reads do. Leaving an organization revokes its access and context-scoped grants, not portable personal wants.

### Typed canonical memory and derived retrieval

Keep canonical typed Want, Intent, Activity, Commitment and Resolution records in Postgres. Proposed text is transient until member acceptance. A want has context, strength, extraction confidence, evidence count, version, confirmation time and lifecycle status. Raw conversation content never enters durable workers, logs or evidence. Store minimal structured provenance with operation IDs and compiler version. Explicit corrections supersede prior versions; inference cannot overwrite them. Semantic retrieval and optional embeddings are derived indexes, not authoritative state.

Feedback has one current assessment per person and logical activity, independent of operation IDs or activity revisions. Revisions of that assessment replace its prior contribution; they do not add another attendance/preference observation. Recompute each affected want's contribution when an assessment is corrected or deleted, retaining at most one evidence contribution per person/activity/want.

Organizer uploads are intentionally stored source documents and may be processed asynchronously. Track extraction and indexing separately. Jobs are idempotent and version-bound, reject obsolete output and reauthorize before publishing results. Summaries carry source dependencies and cannot combine private wants into shared loop knowledge. Search filters permissions before keyword/vector ranking, then rechecks citations and access before delivery.

Alternative: store all memory as generated Markdown or capture every conversation. This loses typed coordination invariants and violates the data boundary. Living Brain informs lifecycle and retrieval patterns; it is not a selected dependency.

### Consent as enforceable authority

The verified client, subject, OAuth scope, applicable lease, resource policy and current consent jointly authorize delegated operations. Lease management happens through first-party consent. Search previews, MCP resources, cached results, streams and polling use the same checks as direct reads. Audit persistence is required before personal output. First-party self-service is audited without an agent lease; export/delete require reauthentication and are not delegated pilot tools.

Consequential assistant mutations use a first-party review flow: prepare an exact activity revision/condition payload, present it to the member, then execute with a single-use confirmation bound to subject, payload and version. Proposed expiry is ten minutes; an expired or changed payload requires a fresh review. Read-only planning and saving accepted private preferences cannot implicitly publish or commit.

### Deadline-based coordination

Members explicitly preauthorize inclusion for one activity revision. At the deadline, lock/serialize the revision and active commitments, compute the greatest feasible subset, and persist a resolution plus recipient inbox/outbox records in one transaction. Predicate: each candidate has at least `min_others` other candidates and every consented required person remains in the set. Use set semantics and AND between conditions. Positive cycles are valid; capacity limits and negative conditions are excluded.

Resolution can be empty or a singleton; there is no hidden five-person formation threshold. Five is an analytics threshold. Finalized means a social plan, not a booking. New joins close at the deadline. Material edits and reopening produce a fresh revision/deadline and require fresh commitments. Withdrawals or eligibility removal recompute the active feasible set, preserve history and mark degradation. Revoked dependency consent suspends affected commitments; removing a condition silently is forbidden.

### Separate operational disclosure and analytics

Default identity visibility is private. A member can disclose participation to specific consenting members for named dependencies or explicitly to opted-in participants for logistics; changes apply to subsequent reads and cannot retract earlier disclosures. Organizer status does not grant a roster or private wants. A person who is also an organizer receives only their ordinary member-authorized participant view.

Show coarse formation state, never exact live social counts. Numeric organizer reports are frozen once after activity close, use approved non-overlapping partitions, suppress cells below five and complementary totals, and expose no arbitrary filters or successive numeric deltas. This is suppression, not formal anonymity. Until a report passes the complete released-output check, show no numbers.

### Delivery and content authority

Persist all resolution notifications atomically, with one logical inbox event per recipient/resolution/type. Polling is the pilot delivery mechanism. Reading by an assistant is not a human acknowledgement. Pending delivery rechecks permissions and obsolescence. Feed cursors are caller/context scoped and expose no global gaps.

Signed announcements use canonical envelopes, immutable versions and explicit author/key history. Key custody must be resolved before implementing signing; service-held keys must be described as service-attested authorship. Signatures never promote text to instructions. Document bodies, titles, summaries and compiled text remain untrusted. The server does not execute embedded commands or fetch embedded URLs.

Implementation decision (2026-11-07): the pilot uses service-held Ed25519 keys supplied through per-environment Vercel Secret configuration, scoped to exact organization/loop public-key registrations. This is application-process custody, not non-exportable KMS custody. The existing Vercel KMS algorithm list does not include Ed25519; preserve the specified envelope algorithm. Registration, deployment, retirement and compromise procedures are recorded in `docs/emba-signing-custody.md`. Production secrets remain unprovisioned until real pilot scopes and verified operators exist.

Worker decision (2026-11-07): reuse the linked Vercel Node runtime and existing secret-authenticated cron mechanism. A five-minute document schedule claims at most ten versions per invocation, with durable five-minute claims, attempt fencing, exponential backoff and a five-attempt automatic cap. Current uploader authority is rechecked through existing processing services. Polling remains member notification delivery; no external messaging provider is introduced. Local process-loss recovery is tested separately from hosted cron acceptance; see `docs/emba-worker-recovery.md`.

Embedding decision (2026-11-07): opt-in pgvector stores only approved canonical document passages. AI SDK 7 routes `openai/text-embedding-3-small` with 1536 dimensions through Gateway, requires ZDR routing, disables SDK telemetry and bounds batches/deadlines/retries. An authorized metadata-only transmission audit commits before external processing; vector persistence and retrieval recheck current authority and sources. Manual processing, durable indexing and explicit semantic MCP retrieval share this adapter. The portal keyword form remains local. Gateway safety-retention qualifications do not satisfy the raw-conversation compiler's unconditional boundary. A synthetic live request returned a credit-related HTTP 403, so semantic quality and actual live provider acceptance remain open. See `docs/emba-embeddings.md`.

## Risks / Trade-offs

- Existing public routes can bypass new gates → classify pilot resources in storage and test all old paths, including files and metadata, before migration.
- Model extraction can misstate preferences → review before activation, structured evidence, conflict states and member correction.
- Revocation races with output → authorize at output and each batch, bound in-flight semantics, never promise recall of delivered data.
- Suppression cannot eliminate inference in a known cohort → fixed reports, no live numeric deltas, disclosed limitations and no anonymity claims.
- External assistants may ignore untrusted-content labels → enforce authority in Loop and require first-party confirmation for consequential writes.
- More consent creates friction → portal works independently and explains the exact data/action being approved.
- Remote client support varies → prove OAuth/read/revoke flows on real intended accounts early.

## Migration Plan

1. Run actual root baseline tests; inventory public/legacy access paths and data. Do not assume the Python test baseline.
2. Add schema and constraints without reinterpreting old proposal pins as private wants. Create explicit pilot resource classification and invitation records.
3. Establish verified identities; do not silently trust legacy unverified accounts or link ownership. Require fresh identity verification and explicit membership.
4. Implement shared gates before importing any pilot information. Migrate only explicitly selected records with ownership and sharing review. Protect or retire every legacy URL to migrated data.
5. Exercise dual-user denial tests, then enable one secure portal/MCP vertical slice. Add knowledge, coordination and memory slices behind the same boundary.
6. Before real-member enrollment, resolve launch gates, rehearse remote connectors, data deletion and operational failure recovery. Document migration commands and backup restore procedures.
7. Rollback disables pilot entry points and workers while preserving protected data. It must never revert pilot resources to link-public access. Forward fixes are preferred for schema changes after data is collected.

## Open Questions

These are bounded implementation gates, not missing product behavior:

- Provider selection is resolved by the user-approved November 7 MVP: Clerk supplies browser sessions and OAuth, with Supabase remaining storage. Development/preview provisioning and public discovery are verified; custom scopes, explicit Claude admission and actual intended-host sign-in/read/write/revoke acceptance remain open.
- Before hosted announcement signing: provision the recorded service-held key configuration for verified pilot scopes and exercise operator rotation/compromise procedures.
- Before production enrollment: identify the pilot owner-verification operator; approve exact audit, compiled-history and backup retention durations and publication-attribution rules on account deletion.
- Before deployment: verify the selected worker runtime operationally and approve model/embedding data-processing terms and a compiler processing boundary. No raw chat can enter durable infrastructure regardless of provider.

The implementation can begin with baseline/schema/access work while these are resolved. Production enrollment cannot begin while its gates remain open.
