# EMBA implementation checkpoint

Start here when continuing `loop-emba-intent-platform`. Its OpenSpec task list is authoritative for completion status. Earlier counts in implementation-status.md are historical snapshots. Main implementation checkpoint: `1fb46e3` (local commit, not pushed); subsequent local commits and the current integration extend that checkpoint.

Next product direction: `openspec/changes/loop-portable-group-memory/` specifies group handles and reviewed shared memory across private Claude/ChatGPT conversations, layered on this foundation. It is a specification, not implemented functionality; its tasks and live-host gates are tracked separately. Preserve the existing personal-memory and launch-policy boundaries.

## Working implementation

The root Next.js app contains shared TypeScript services, PostgreSQL migrations, a member/organizer portal, HTTP/MCP adapters, scoped assistant consent and audited reads, confirmed consequential actions, private Want/Intent editing and proposal review, cited trip resources, service-attested announcements, conditional commitments, inbox updates, feedback, export and pilot deletion. Legacy public routes deny explicitly classified pilot resources.

Production portal authentication remains unavailable. Announcement signing now supports exact-scope server-secret Ed25519 configuration and fails closed when unconfigured; no live signing keys have been provisioned. Durable document processing uses the existing Vercel Node runtime and a secret-authenticated cron endpoint with bounded claims, retries and backoff. Synthetic fixtures remain test-only. This code has not been deployed or migrated to the hosted database; the previous deployed foundation is unchanged. Apply the migrations before deploying because legacy getters and workers use new columns.

Opt-in pgvector retrieval and a Vercel AI Gateway embedding adapter are implemented. The semantic MCP tool, scheduled indexing and manual resource processing use the adapter when explicitly enabled and the optional schema exists. Default keyword search stays local. Portal disclosure explains external semantic processing. See emba-knowledge-report.md, emba-signing-custody.md and emba-worker-recovery.md.

## Verification and runnable fixtures

- `npm test`: application tests; native-only and explicit production HTTP/restore checks skip by default.
- `npm run emba:rehearsal`: disposable synthetic service/MCP acceptance fixture.
- `npm run emba:browser`: localhost-only synthetic identities with actual components, actions and disposable database. Five browser drivers cover 18 base, 17 proposal/privacy, 17 organizer, 16 role-administration and 15 announcement checks (83 recorded checks).
- `npm run emba:postgres-check`: isolated native PostgreSQL runner; one instance at a time. Windows native binaries are local ignored tooling, documented in emba-pilot.md.
- Opt-in built-Next HTTP boundary tests and physical backup/restore rehearsal passed separately; see emba-pilot.md and emba-restore-rehearsal.md.

Latest integrated results belong in [emba-integration-verification.md](emba-integration-verification.md). Earlier suite/build totals in focused reports are historical evidence, not verification of the latest files. Five vector-core checks previously passed on real PostgreSQL/pgvector. The expanded optional integration suite has PGlite/pgvector coverage; its final native rerun remains pending because the user requested no Docker startup. Do not start Docker to bypass that preference. Run a production build only after shipped code changes, once at the end, with dev servers stopped.

## Deferred decisions and remaining acceptance

Real auth provider/project and Claude/ChatGPT accounts were explicitly deferred. Do not create a homemade OAuth provider, weaken production authentication, or treat fixture acceptance as live-host acceptance. Routine engineering choices now use configured service-held Ed25519 keys, the existing Vercel cron runtime, and opt-in Gateway embeddings. Owner/provider processing approval and live account setup remain distinct from these implemented adapters. No raw-conversation compiler is implemented. See [remaining owner inputs](emba-remaining-inputs.md).

A synthetic embedding request reached Gateway but returned HTTP 403 for the credit/billing gate. No successful live embedding or retrieval-quality acceptance is claimed. Optional semantics stay disabled until schema, processing approval and funded Gateway access are ready.

Before enrollment: resolve owner verification, exact audit/history/backup retention, organization-publication attribution and external tombstone durability/restore traffic controls. Signed announcements retain their original author ID; publication prose and shared legacy identity remain after pilot deletion. Restored pending invitations addressed only by email need a cleanup policy. Do not claim complete account erasure.

Announcement publication, correction history and key-status presentation have local browser coverage. The role, announcement and trip-panel follow-ups cover late access and source changes. Actual worker process death and restart now have native local coverage. Hosted worker operation, full authenticated Next transport, actual provider reauthentication and remote OAuth/read/revoke/confirmed-write acceptance remain unverified.

## Collaboration notes

The trip-panel follow-up rechecks role authority and source versions after asynchronous activity reads, fails closed on late access loss, and independently re-authorizes selected sources from another trip. Seven snapshot cases cover demotion, identity/membership revocation, source correction/withdrawal and other-trip access loss. This does not establish live-host acceptance; see emba-portal-report.md and the integrated verification report for evidence.

The user authorizes continued implementation, subagents and commits. They have not asked to push this checkpoint. Keep changes scoped and record actual results. Do not repeat deferred questions. CodeGraph has returned `Transport closed`; direct file reads are the current fallback. Native Node/PostgreSQL tests require the approved elevated execution context. No verification server should remain running at handoff.

Read emba-pilot.md for setup and release boundaries; focused reports preserve evidence. Keep this checkpoint concise instead of rereading the complete historical conversation.
