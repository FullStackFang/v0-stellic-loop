# EMBA implementation checkpoint

Start here when continuing `loop-emba-intent-platform`. The OpenSpec task list is authoritative: **37/51 bounded tasks complete**. Earlier counts in implementation-status.md are historical snapshots. Main implementation checkpoint: `1fb46e3` (local commit, not pushed).

## Working implementation

The root Next.js app contains shared TypeScript services, PostgreSQL migrations, a member/organizer portal, HTTP/MCP adapters, scoped assistant consent and audited reads, confirmed consequential actions, private Want/Intent editing and proposal review, cited trip resources, service-attested announcements, conditional commitments, inbox updates, feedback, export and pilot deletion. Legacy public routes deny explicitly classified pilot resources.

Production portal authentication and the announcement signer default to unavailable. Synthetic fixtures are test-only. This code has not been deployed or migrated to the hosted database; the previous deployed foundation is unchanged. Apply the migrations before deploying because legacy getters now use classification columns.

## Verification and runnable fixtures

- `npm test`: application tests; native-only and explicit production HTTP/restore checks skip by default.
- `npm run emba:rehearsal`: disposable synthetic service/MCP acceptance fixture.
- `npm run emba:browser`: localhost-only synthetic identities with actual components, actions and disposable database. Five browser drivers cover 18 base, 17 proposal/privacy, 17 organizer, 16 role-administration and 15 announcement checks (83 recorded checks).
- `npm run emba:postgres-check`: isolated native PostgreSQL runner; one instance at a time. Windows native binaries are local ignored tooling, documented in emba-pilot.md.
- Opt-in built-Next HTTP boundary tests and physical backup/restore rehearsal passed separately; see emba-pilot.md and emba-restore-rehearsal.md.

The checkpoint's complete application suite passed **468 tests across 60 files**, with 14 native-only/opt-in checks skipped. Latest organizer slice also passed 33 native PostgreSQL tests, 17 browser checks, types/lint and the final production build. Broader verification counts live in implementation-status.md. Run a production build only after shipped code changes, once at the end, with dev servers stopped.

## Deferred decisions and remaining acceptance

Real auth provider/project and Claude/ChatGPT accounts were explicitly deferred. Do not create a homemade OAuth provider, weaken production authentication, or treat fixture acceptance as live-host acceptance. Production signer custody, compiler/embedding processing terms and worker hosting also remain undecided. No raw-conversation compiler or vector retrieval is implemented.

Before enrollment: resolve owner verification, exact audit/history/backup retention, organization-publication attribution and external tombstone durability/restore traffic controls. Signed announcements retain their original author ID; publication prose and shared legacy identity remain after pilot deletion. Restored pending invitations addressed only by email need a cleanup policy. Do not claim complete account erasure.

The role follow-up passed 43 focused tests, 16 browser checks, types/lint and a final production build. Announcement publication, correction history and key-status presentation now have local browser coverage. The announcement follow-up fixes stale verification after key-status changes and passed 19 announcement portal tests, 38 surrounding portal tests and 25 native PostgreSQL tests, plus 15 browser checks, types/lint and the final production build. Full authenticated Next transport, actual provider reauthentication, actual worker-outage recovery and remote OAuth/read/revoke/confirmed-write acceptance remain unverified.

## Collaboration notes

The user authorizes continued implementation, subagents and commits. They have not asked to push this checkpoint. Keep changes scoped and record actual results. Do not repeat deferred questions. CodeGraph has returned `Transport closed`; direct file reads are the current fallback. Native Node/PostgreSQL tests require the approved elevated execution context. No verification server should remain running at handoff.

Read emba-pilot.md for setup and release boundaries; focused reports preserve evidence. Keep this checkpoint concise instead of rereading the complete historical conversation.
