## 1. Baseline and bounded implementation decisions

- [x] 1.1 Read root instructions and relevant installed framework guides; run actual baseline tests and record results without assuming the Python baseline.
- [x] 1.2 Inventory identity, trip/board routes, actions, files, share previews, event feeds and caches; classify every path capable of reaching pilot data.
- [ ] 1.3 Record auth/delegation provider decision and prove discovery, resource audience, PKCE and client identity with intended Claude/ChatGPT hosts before building custom integration behavior.
- [ ] 1.4 Record signing-key custody, compiler/embedding processing boundary and worker runtime decisions; verify no proposed provider requires durable raw conversation storage.

## 2. Private cohort foundation

- [x] 2.1 Add migrations for verified-person mapping, organization membership, stable loop IDs/paths, roles and expiring single-use invitations; test same-tenant references on Postgres.
- [x] 2.2 Implement central principal and permission services with role inheritance; test follower denial, parent/child boundaries, removed memberships and cross-user/tenant access.
- [ ] 2.3 Implement verified sign-in and invitation acceptance without link-based auto-enrollment; test spoofed IDs, invitation replay and legacy unverified identity upgrades.
- [x] 2.4 Add explicit pilot-resource classification and gates to all inventoried legacy paths; test anonymous file/OG/metadata access denial and unchanged unrelated public boards.
- [ ] 2.5 Build the minimal member sign-in/trip shell and organizer invitation/role controls; verify keyboard/mobile and expired/revoked access states.
- [x] 2.6 Run focused foundation tests and record changes, decisions and remaining gates before proceeding.

## 3. Personal-data and delegated-access foundation

- [x] 3.1 Add typed private Want/Intent versions, minimal structured evidence and scoped operation IDs; test ownership and duplicate-operation constraints.
- [x] 3.2 Implement lease grant/revoke/list through first-party consent plus audit service; test scope, expiry, wrong client and audit-write failure.
- [x] 3.3 Implement read-only HTTP/MCP adapters and explicit-principal stdio mode over shared services; test token validation and resource authorization parity.
- [x] 3.4 Enforce leases/audit on private previews, resource reads, cache hits and later batches; test revocation after a session has opened.
- [x] 3.5 Implement single-use ten-minute consequential-action confirmation bound to actor/payload/version; test altered payloads and replay.
- [ ] 3.6 Build member assistant-connections and audit views; verify real-client OAuth, one private read and revocation early, recording account/client/date and limitations.
- [x] 3.7 Run focused access tests and record changes, decisions and remaining gates before proceeding.

## 4. Trip knowledge and announcements

- [x] 4.1 Add authorized document upload/version/delete with bounded type/size validation and member-visible source access; test inherited and revoked access.
- [x] 4.2 Implement version-bound extraction/index jobs and processing status; test partial failure, retry deduplication and rejection of obsolete/deleted-source output.
- [x] 4.3 Implement permission-filtered keyword/vector retrieval with cited passages and source dependencies; verify pgvector behavior on real Postgres.
- [x] 4.4 Implement disputed/superseded knowledge responses, timezone-aware itinerary evidence and derived-data invalidation; test conflicting bus times and removed-source summaries.
- [x] 4.5 Implement signed canonical announcement envelopes, key lifecycle and corrections according to the recorded custody decision; test text/loop/version tampering and compromised-key presentation.
- [x] 4.6 Add organizer resource-processing/announcement views and member cited resource/update views; test injected bodies, titles and summaries trigger no authority changes or server actions.
- [x] 4.7 Run focused knowledge tests and record changes, decisions and remaining gates before proceeding.

## 5. Conditional coordination

- [x] 5.1 Add versioned activities, explicit commitments and activity-scoped name/dependency consent; validate thresholds, references and per-person uniqueness.
- [x] 5.2 Implement the pure fixed-point resolver; test chains, positive cycles, threshold edges, empty/singleton output, order independence and exhaustive small-set greatest-subset property.
- [x] 5.3 Implement deadline finalization with serialization, immutable resolution history and atomic per-recipient inbox/outbox writes; test concurrent withdrawal and retry deduplication.
- [x] 5.4 Implement withdrawal, membership removal, cancellation, degradation and fresh-revision reopening; test no late joins or silently carried-forward authorization.
- [x] 5.5 Implement dependency-consent revocation as suspension; test that it never weakens conditions or reveals target participation through errors.
- [x] 5.6 Build activity creation, condition review, commitment, consent and withdrawal portal flows; test stale confirmation and timezone presentation across Hanoi and Tallinn.
- [x] 5.7 Add caller-scoped update cursors, obsolete-delivery suppression and separate human acknowledgements; test old cursors after access removal and assistant polling without read acknowledgement.
- [x] 5.8 Expose MCP mutation preparation/execution for publication, commitments and disclosure through the shared services; revalidate lease/role/consent/version on execution and test confirmation replay, changed payload and revocation after approval.
- [x] 5.9 Run focused coordination tests and record changes, decisions and remaining gates before proceeding.

## 6. Disclosure and personal planning

- [x] 6.1 Implement participant projections with default-private names and no organizer privilege expansion; test member/organizer dual-role behavior across all adapters.
- [x] 6.2 Implement fixed frozen analytics and complete released-output suppression checks; test eight/six complementary leakage, zero/small cells and repeated/filter query attempts.
- [ ] 6.3 Implement transient compilation, review-before-activation and typed correction lifecycle; test crisis exclusions and raw-text canaries in failure paths, logs and storage.
- [x] 6.4 Implement optimistic-version corrections, context-specific preference handling and review-needed conflicts; test explicit corrections win over stale inference and reads do not increase strength.
- [x] 6.5 Implement bounded `plan_for_me` bundles with current active wants, authorized evidence/activities, truncation and incomplete-evidence flags; test lease/audit enforcement and no automatic enrollment.
- [x] 6.6 Implement one current assessment per person/logical activity and member memory editing; test different-operation duplicate feedback, correction/deletion of prior contributions and that nonattendance/nonresponse never imply dislike.
- [x] 6.7 Run focused memory/disclosure tests and record changes, decisions and remaining gates before proceeding.

## 7. Export, deletion and launch policy

- [ ] 7.1 Obtain and document pilot owner-verification evidence and exact audit/history/backup retention and publication-attribution policy before real-member enrollment.
- [x] 7.2 Implement reauthenticated first-party export excluding others' private data; verify delegated clients cannot invoke the flow directly.
- [ ] 7.3 Implement deletion across personal records, leases, evidence, vectors, source-dependent summaries, caches and jobs, including commitment withdrawal and history de-identification.
- [ ] 7.4 Implement expiry/retention jobs and restore tombstones; test deleted data cannot reappear through backup restoration or stale worker output.
- [ ] 7.5 Review user-facing data-boundary statements, provider processing terms, revocation limitations and consent text against actual behavior.

## 8. Rehearsal and release verification

- [x] 8.1 Create deterministic EMBA Vietnam/Estonia fixtures: signed update, itinerary bus citation, eight opt-ins yielding six participants with suppressed organizer counts, and a private Hanoi afternoon context bundle.
- [ ] 8.2 Run end-to-end portal/MCP flows locally with member A, member B, organizer and nonmember; verify denial through every alternate legacy path.
- [ ] 8.3 Verify remote Claude and ChatGPT OAuth/read/revoke plus first-party-confirmed writes on actual intended accounts; record real results rather than treating synthetic HTTP tests as connector acceptance.
- [x] 8.4 Run required lint, type and test suites including real-Postgres-specific cases; if shipped app code changed, stop competing dev/build processes and run one final production build.
- [x] 8.5 Write README/runbook for setup, migrations, remote connector configuration, processing failures, key rotation, retention/restore and privacy-preserving rollback.
- [x] 8.6 Review all launch gates and acceptance scenarios; report unresolved gates honestly and do not enroll real members until satisfied.
