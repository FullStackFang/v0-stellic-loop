# Implementation evidence

## Current continuation — November 7, 2026, Clerk and shared notes

The user approved choosing the sign-in/OAuth provider and prioritizing one-assistant shared memory. Clerk Hobby is provisioned for development/preview after terms acceptance. The server-session adapter verifies session/user binding and primary email, creates an issuer/subject-specific person without email-based account merging or membership, and rejects revoked/deleted identities. Scoped sign-in and account surfaces plus seven-day exact-group consent are implemented. Fresh-authentication time now derives conservatively from signed Clerk iat/fva claims using the oldest instant in the reported minute. Missing, invalid or stale evidence fails closed. Native real-adapter tests cover privacy export, deletion and denied reenrollment.

Development OAuth settings and public metadata now verify audience support, S256, opaque tokens, explicit-only CIMD admission and DCR disabled. The actual Claude public client metadata was fetched successfully. Custom scopes and explicit client admission still await authenticated Dashboard setup; actual user/host OAuth acceptance and deployment are not demonstrated. The earlier provider-selection deferral is superseded, while owner/retention policy remains deferred.

The portable slice implements immutable handles, current shared notes, correction/withdrawal, reviewed assistant writes and seven group tools. Native PostgreSQL passed 25 focused address/note/privacy/action/consent tests. Separate PGlite MCP tests exercise real SDK transports and portal server actions with synthetic identities. It does not yet implement sourced group documents, organizer decisions, dependency graphs or full group context. Foundation remains 39/51; portable tasks 2.1, 2.2, 4.2 and 5.3 are checked. The final production build, TypeScript and focused lint passed; production dependency audit reported zero vulnerabilities. An additional 15 native tests passed across Clerk identity, group MCP, group panel and portal-action files. The full application suite passed: 563 tests passed and 23 skipped (78 files passed, 4 skipped). Three built-Next HTTP boundary tests also passed against disposable native PostgreSQL. Full-repository lint retains 16 existing errors confined to ignored Playwright scratch files. Verification entries below belong to earlier continuations. See `docs/emba-mvp-slice.md` and both task ledgers.

## Baseline — 2026-11-06

Starting commit: `575d67d8c776f78cf4a5f884ed94da3913fe17bc`.
The change directory and `docs/loop-emba-mvp-hardening.md` were already untracked; preserve them.

Read the supplied global instructions, root AGENTS.md, proposal, design, tasks and all seven capability specifications. Consulted installed Next.js guides for data security, authentication, route handlers and caching (including the previous caching model used by this configuration). Authorization must live in the data/service layer and each externally callable action; page checks alone are insufficient. Metadata and file responses are separate entry points.

`npm.cmd test` passed: **34 files, 261 tests**, exit 0, duration 50.77 seconds. The runner reported Vitest 5.1.0. Root Vitest excludes `web/`. SQL tests use PGlite by default; this result is not evidence of real-Postgres concurrency, Supabase default grants, pgvector, browser acceptance or remote connector compatibility. No production build was run because only documentation changed. No Python baseline was assumed.

CodeGraph MCP provided current source and call paths. Its shell command and `rg` were unavailable, so supplemental route/config/cache enumeration used PowerShell.

## Legacy access inventory — task 1.2

Classification below describes the existing contract and the gate required **if the resource is explicitly migrated into the pilot**. No production record has been classified or migrated yet. Public-board behavior remains the regression contract outside the pilot.

| Surface | Existing authority/data | Required pilot treatment |
| --- | --- | --- |
| `lib/identity.ts`, `lib/session.ts`, `lib/viewer.ts` | `qb` signed cookie contains person ID and issuance time; viewer confirms person exists. Identity may originate from OTP or a legacy cookie. | Require provider-verified identity mapping and current membership separately. Cookie alone has no verification provenance. |
| `actions/verifyCode.ts`, `/m/[token]` | OTP replays pending post/respond/join/create operations; magic link sets legacy session. | Recheck classification, verified principal and membership on replay; neither grants pilot membership. |
| `/trip/[slug]`, `lib/trip-store.ts` | Public board/trip lookup; shared items and caller-owned items; counts, workspace writer, document names. | Gate before loading/serializing any pilot content, including written itinerary and filenames. Replace legacy count/name projection. |
| `/api/trip/[slug]/files` POST | Any existing session uploads and `joinBoard` automatically enrolls. | Require current scoped organizer upload authority; remove implicit enrollment for pilot resources. |
| `/api/trip/[slug]/files/[id]` GET | Shared file bytes available anonymously; otherwise owner session. | Current loop read permission before bytes or filename; retain private/no-store headers. |
| `/api/trips` POST; `/trips/new`, `/trips/[id]/edit` | Anonymous draft creation and composer shell; browser-held edit secret. | No implicit pilot association or enrollment; pilot editor must use verified principal and role. |
| `/api/trips/[id]` GET/PATCH/POST; `lib/trip-workspace-store.ts` | Bearer edit secret reads/saves draft and publishes a board. Saves can update an already published board. | Classify workspace before publication as well as its board; old edit token cannot bypass pilot checks. |
| `/api/trips/[id]/documents` POST | Edit secret authorizes upload and synchronous extraction. | Authorize scoped organizer before processing or storage; version jobs and bound processing. |
| `/api/trips/[id]/documents/[documentId]` GET | Edit token required only while unpublished; published document bytes are public. | Gate by workspace/board classification regardless of publication; protect title, MIME and bytes. |
| `/api/trips/[id]/parse` POST | Edit token permits writer and stored document text to reach model gateway. | Current authority and processing boundary before extraction; no private-memory raw chat through this durable draft path. |
| `/b/[slug]`, `/b/[slug]/new`, `/b/[slug]/you` | Public board lookup; board data, counts, proposal prefill; personal page uses legacy viewer. | Protect every page and its serialized props, including prefill and board title. |
| `/b/[slug]` generateMetadata and opengraph-image | Public name/title lookup, independent of page rendering. | Anonymous requests must not identify pilot board. Robots exclusion is not access control. |
| `/p/[id]`, `lib/proposalPage.ts` | Public proposal and board lookup; details, names/counts, forecast; React request memoization. | Gate before loading DTO, including metadata calls and memoized outputs. |
| `/p/[id]/og`, `/p/[id]/invite.ics` | Public image and calendar read by proposal ID, including title/time/counts. | Gate through proposal's classified board; deny identifying metadata as well as body. |
| `actions/share.ts`, `lib/ops.ts` mintShare | Anonymous share creation with optional person attribution. | Share token never supplies pilot authority; protect target before creating/returning URL. |
| `actions/trip.ts` startTrip/joinTrip/changeTrip | Legacy identity, link-based join and item/settings/RSVP mutations. | Explicit invitation only; current role and ownership checks for each operation. |
| `actions/post.ts`, `actions/respond.ts`, `lib/ops.ts` | Legacy session/OTP and automatic board joins; old quorum and notifications. | Gate direct call and OTP replay. Pilot conditional commitments must use new versioned services. |
| `actions/days.ts` | Session-based free-day and proposal-day writes, automatic join. | Pilot role and context checks; no implicit membership. |
| `actions/details.ts`, `actions/lifecycle.ts` | Existing response/poster checks for details/edit/close. | Current pilot access plus action-specific authority; prior response/ownership does not preserve access after removal. |
| `actions/settings.ts` | Global name visibility and board steward sharing. | Neither setting grants activity-specific name/dependency consent or organizer access to wants. |
| `actions/board.ts` | Creates legacy public board with session/OTP. | Preserve public contract; creation never establishes pilot ownership. |
| `lib/events.ts`, `proxy.ts` | Event writes and share/source attribution cookie. Proxy only matches board/proposal paths. | Attribution is not authorization. No existing public event feed found in root routes; new polling needs caller-scoped cursors and current access checks. |
| `/api/cron/daily` | Cron secret; enumerates all boards and stamps proposal idle events, returns aggregate count. | Explicitly separate pilot lifecycle from legacy idle processing and operational aggregates. |
| `lib/after.ts`, `lib/notify/*` | Post-transaction recipient/title/count notifications; log fallback, configurable Twilio/Verify. | Do not route pilot events through legacy notifications/log payloads; pilot requires transactional inbox/outbox and authorized delivery. |
| `lib/load.ts`, `lib/trip-store.ts`, workspace store | Low-level getters accept IDs and do not establish pilot authority. | Shared services must guard all callers, including direct SQL bypasses in routes/actions. |
| `lib/proposalPage.ts`, `lib/forecast.ts` | React `cache`; weather fetch revalidates at 21600 seconds. | Gate before composing pilot response and before any external location-bearing request. No shared private-data cache exemption. |
| `components/TripComposer.tsx`, `TripView.tsx` | LocalStorage draft ID/edit token; client edit affordance based on token presence. | Client storage/UI is never authority. Revocation must reject subsequent server calls. |
| Root/layout/privacy/terms/robots/favicon; `public/` demos/fonts | Static/general UI and public assets; demo rewrite in Next config. | No pilot documents or personal fixture exports in public assets. These are outside live database authorization. |

Migration checklist: board, trip items/files, proposals/details/responses/shares, workspace and workspace documents must resolve to explicit pilot classification before importing real data. Include orphan/unpublished workspaces. Test anonymous, member A, member B, removed member, follower and nonmember through every applicable surface above. Existing public-board tests must keep passing.

## Unresolved gates

### 1.3 — provider and real-host compatibility

No auth provider selected or provisioned by this work. Inspected local environment variable **names only**: DATABASE_URL, SESSION_SECRET, CRON_SECRET, NEXT_PUBLIC_APP_URL. These do not establish an OAuth provider project. Existing Supabase dependency/database configuration is not proof of configured auth/delegation.

Vercel Marketplace/auth guidance consulted. `vercel integration discover --category authentication` could not run: CLI not installed. Recommended setup is `npm i -g vercel`, then authenticated discovery against the intended project. No installation or provider terms were silently accepted.

User explicitly deferred provider/account selection during this session. Continue provider-independent foundation work; do not require an answer now. Must eventually record issuer, protected-resource discovery, audience, PKCE enforcement, verified client identity, account/client/date and actual OAuth/read/revoke outcomes before marking this task complete. No synthetic or real-host compatibility result exists yet.

### 1.4 — custody and processing

Still open: signing-key custody and rotation, compiler/embedding provider terms, version and worker hosting. Existing trip extraction calls a model gateway and intentionally persists organizer writer/document text; it is not a compliant private-chat memory compiler by reuse alone. The design's rule remains: raw private conversation stays transient, never in durable queues, logs, evidence or vectors. No provider retention guarantee was verified in this pass.

### Later launch gates

Owner-verification operator/evidence, exact audit/history/backup retention and publication attribution on deletion remain unresolved. Real-Postgres tests, remote host tests and later implementation slices remain pending. No real members enrolled.

## Foundation implementation — tasks 2.1 (partial), 2.2 (complete)

Added `20261106232912_emba_foundation.sql` using the installed Supabase CLI's `migration new`. It adds verified issuer/subject mappings to existing people, organizations, revocable memberships, stable loop IDs and paths, revocable role bindings, and expiring hashed-token invitation records. Composite foreign keys enforce same-tenant references. Generated immediate-parent paths enforce an acyclic loop hierarchy. Tables enable RLS and revoke public/anon/authenticated privileges; access is server-side only. Existing people and boards are not automatically migrated.

Added `lib/emba/access.ts`: a trusted verifier boundary creates an opaque, immutable principal from an existing nonrevoked identity mapping. Base authority rechecks identity expiry/revocation, active membership and all ancestor role grants. Followers read; members post/commit; organizers manage; owners alone delegate organizer authority. Child roles never grant parent access. Organization removal does not remove personal ownership. This service is not yet wired to a public route; delegated output still requires future lease/audit services. No provider token validator is claimed implemented.

Tests were written first: five schema tests failed for absent tables, then passed after migration; seven access assertions failed with a deny-all implementation, then passed with the permission service. The focused suites contain 13 passing tests. Updated the existing test reset to include organizations so successive fixtures cannot leak tenant state.

Validation: `npm.cmd test` passed **36 files / 274 tests**, exit 0 (132.71 seconds). `npx.cmd tsc --noEmit` passed. An independent reviewer reran all 13 focused tests and reported no actionable findings. OpenSpec strict validation passed before the foundation additions; final validation is recorded below when complete.

Task 2.1 is intentionally unchecked: invitation redemption/replay behavior is not implemented yet and real-Postgres validation is outstanding. Docker daemon was unavailable both inside and outside the sandbox, and remained unavailable after starting Docker Desktop in the background. No local postgres/psql executable was found. Do not claim PGlite as the required real-Postgres verification. Task 2.3 and the sign-in/portal portion depend on the user-deferred provider gate; the foundation slice is not release-ready.

Reviewed current [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [changelog](https://supabase.com/changelog). CLI installed here is 2.107.0; commands were checked via help rather than assuming v3 defaults. No hosted database migration was applied.

Final checks: production build passed (Next.js 16.4.2); strict OpenSpec validation passed; changed-file ESLint passed. Full `npm.cmd run lint` failed with 16 pre-existing `@typescript-eslint/no-require-imports` errors in untouched `.playwright-mcp` scripts: `check-trip-html.cjs`, `css-diagnose.cjs`, `trip-browser.cjs`, `trip-build-fixes.cjs`, `trip-css-fix.cjs`, `trip-encoding.cjs`, `trip-final-fix.cjs`, `trip-icons.cjs`, `trip-seed.cjs`. These were not silently changed. Overall progress: **3/51 complete** (1.1, 1.2, 2.2), with 2.1 partially implemented. No commit, deployment or real-member enrollment performed.

## Subsequent production deployment — 2026-11-06

User explicitly requested deployment. Verified the linked Vercel project `prj_F0hnRkjJuhrkiCzF6lqJFWzaowld` (`v0-stellic-loop`, Fullstackfang Production), then deployed the current local workspace using Vercel CLI 65.12.1 through npx. Deployment `dpl_C7iLsdirD4wgKqmtHoRABPMCG97g` reached READY, target production, remote build duration 19 seconds. Production alias: https://v0-stellic-loop.vercel.app. Source was the working tree based on `575d67d`, including uncommitted foundation changes; no new Git commit was created.

Homepage smoke test via `vercel curl` returned HTTP 200. That command automatically created a project automation protection-bypass secret; no secret value was printed. Deployment-specific runtime error query returned zero records in its five-minute window. This is a smoke test, not pilot acceptance. Database migration remains unapplied; no new pilot routes, provider integration or enrollment were activated.

## Autonomous MCP pilot foundation - 2026-11-07 UTC

User requested maximum independent progress toward a Living Brain-like MCP/API pilot, keeping the provider/account decision deferred. The current working tree now has **11/51 completed tasks**: 1.1, 1.2, 2.2, 2.4, 2.6, 3.1, 3.2, 3.3, 3.5, 3.7 and 5.2. Completion refers to those bounded service/test tasks, not a live-member release.

- Typed private Want/Intent versions, structured evidence, scoped operation replay and optimistic corrections. Reads exclude archived/superseded/expired records and never strengthen evidence. Raw-conversation fields are rejected. Writes require current first-party identity; a delegated write lease cannot substitute for member review. No browser editing or compiler exists yet.
- First-party lease grant/revoke/list and audit services, exact client/action/context scope, current identity/membership checks, bounded audited reads, and transaction rollback on audit failure. No assistant can grant itself access. Connections/audit UI is pending.
- Read-only REST, stateless Streamable HTTP MCP, protected-resource metadata and explicit-token stdio. Official SDK and jose verify signed tokens, issuer, exact audience, expiry, subject and allowlisted client. Remote tokens never create first-party authority or auto-enroll people. Unknown configuration fails closed before DB use. Synthetic signed-token tests do not prove provider/host OAuth or PKCE interoperability.
- Invitation issue/list/revoke/accept services use hashed tokens, trusted verified recipient email, current issuer authority and transaction locks. Replay, wrong email, revoked inviter and prior-membership reenrollment tests pass. Sign-in/enrollment and organizer controls remain pending, so 2.3 stays unchecked.
- Explicit board/workspace pilot classification closes the inventoried legacy read/write/file/metadata/OG/ICS/magic-link/OTP/notification/cron paths, including linked-resource inheritance. Unrelated public-board regressions pass. A controlled classification transition, concurrency verification and handling previously public caches/downloads remain launch gates; no live records were classified.
- Ten-minute single-use confirmations bind actor/client/action/target/version/canonical payload digest. Consumption, callback SQL effects and audit commit atomically. The eventual action callback must enforce current lease, role, disclosure consent and target version; simulated callback denial tests are not proof of those future workflows. Task5.8 remains open.
- Pure greatest-fixed-point coordination resolver passes threshold/cycle/chain/order tests and an exhaustive independent small-set oracle. Activities, deadline finalization, disclosure and notifications are not implemented by this resolver.

Added `docs/emba-pilot.md`, auth variable examples, `npm run emba:demo` and `npm run emba:mcp`. The demo uses a disposable synthetic database, seeds Hanoi wants/intents, calls the actual MCP tool, then proves that revocation denies the next call on the same connection. It explicitly rejects the remote test-DB mode. Also verified a separate stdio SDK client handshake and two-record read. These are developer rehearsals, not remote Claude/ChatGPT account acceptance.

Verification for the final app code: **42 test files / 340 tests passed**, TypeScript passed, changed-file ESLint passed, `git diff --check` passed, and one Next.js 16.4.2 production build passed. Local production-server smoke checks for `/api/mcp`, `/api/emba/memory` and `/.well-known/oauth-protected-resource` all returned sanitized `503` plus `Cache-Control: no-store` without auth configuration. The temporary server was stopped. Strict OpenSpec validation passed. Existing repository-wide lint failures in untouched `.playwright-mcp` scripts remain as recorded above. Dependency installation was repaired after an optional-package installation error; pinned MCP SDK/jose/zod and tsx are in the lockfile. No unrelated dependency audit fix was applied.

Independent review identified the delegated-memory-write review bypass, which was reproduced by a failing regression and fixed with first-party-only writes. Subsequent reviews found no actionable adapter/confirmation bypass. Real PostgreSQL concurrency, pgvector and browser accessibility validation remain outstanding. PGlite is not recorded as equivalent acceptance.

**This slice is not deployed.** The prior production deployment remains the earlier foundation snapshot. New classification getters require the new migrations before deploying this code. Four new EMBA migrations exist locally, and none has been applied to the hosted database. No commit/push, real-member enrollment, provider provisioning or actual host authentication was performed. Owner verification, retention/deletion/restore policy, signing custody and compiler processing terms remain unresolved launch gates.

## Subsequent local implementation — 2026-11-06

The earlier **11/51** snapshot above describes the foundation at that time. Current OpenSpec task checkboxes record **26/51** bounded tasks complete; task 8.4 and all release gates remain open pending root-owned final verification. Detailed evidence and limits are in [knowledge](../../../docs/emba-knowledge-report.md), [activity](../../../docs/emba-activity-report.md), [portal](../../../docs/emba-portal-report.md), [privacy](../../../docs/emba-privacy-report.md), and [rehearsal](../../../docs/emba-rehearsal-report.md) reports.

Versioned text/structured-itinerary resources now support bounded extraction, processing status/retry, authorized full-text search and citations. Ephemeral injected Ed25519 signing supports service-attested announcements and immutable corrections; production key custody is not configured. Activity services support conditional opt-in, deadline resolution, inbox/outbox, private disclosure and frozen safe organizer reports. MCP now exposes read and exact first-party-confirmed mutation tools. Personal planning and feedback services, a first-party portal shell, and pilot export/delete/tombstone services are present. The portal still defaults to unavailable sign-in; it cannot enroll real users.

The synthetic Vietnam/Estonia fixture and targeted MCP SDK test passed; the standalone `npm run emba:rehearsal` passed when run outside the restrictive sandbox. A native Windows x64 PostgreSQL runner is available, and five focused concurrency tests have passed. The complete native EMBA result, integrated suite/build counts, browser accessibility, remote Claude/ChatGPT OAuth and pgvector evidence are not recorded here. Production migrations remain unapplied; no real members were enrolled. See [pilot runbook](../../../docs/emba-pilot.md) for native runner setup, migration order, operating boundaries and remaining gates.

## Final integrated verification — 2026-11-06

Current progress: **35/51 tasks complete**. Earlier counts above are historical snapshots. Remaining tasks depend on verified provider/browser/remote-host integration, production signing and processing decisions, or approved retention/restore policy; supported local services are implemented and tested. No claim of real-member launch acceptance is made.

- Full root application regression: `npm test -- --exclude '.playwright-mcp/**' --maxWorkers=4` passed **55 suites / 431 tests**, with seven native-only tests skipped. The ignored directory contains local PostgreSQL tooling dependencies, not application tests. Four subsequent disclosure/dual-role/timezone acceptance tests passed separately (435 passing application checks in total).
- Native PostgreSQL: **149 tests across 20 suites** passed cumulatively: 141 in the complete service sweep, four portal lifecycle tests, then four disclosure tests. The first sweep picked up the lifecycle test while its imported file was still being written; that import failure was resolved and its entire suite reran successfully. Seven native cases use independent connections for real lock/race behavior. No pgvector acceptance is claimed.
- `npm run emba:rehearsal` passed after the final service fixes: signed update, cited bus evidence, eight opt-ins/six outcomes, suppressed organizer report, private planning, exact MCP confirmation and revoked access.
- TypeScript, changed-file ESLint, `git diff --check`, and strict OpenSpec validation passed. Repository-wide lint retains the previously recorded unrelated errors in ignored local `.playwright-mcp` scripts; those files were not changed.
- One final `npm run build` passed on Next.js 16.4.2. A temporary production server returned `/emba` HTTP 200 with the unconfigured sign-in message and private/no-store caching. MCP, memory, document and protected-resource metadata routes returned sanitized HTTP 503 with `Cache-Control: no-store`. The server was stopped.

Added final portal capabilities include separate global/trip preferences and editable timed intents, named authorized context selection, membership administration, human inbox acknowledgements and cursor recovery, and reviewed activity revisions requiring fresh commitments. Service reviews fixed scoped inbox lease checks, reopened-event revision binding, invitation read auditing, and person/authority/resource lock ordering. Exact changed-payload, stale-revision, revoked lease/role/dependency consent, deletion and organizer/member disclosure checks pass.

This work is **not deployed**. Hosted EMBA migrations remain unapplied. Keep live enrollment disabled until the deferred auth provider/accounts, production key custody/processing terms, owner verification and retention/restore policy are resolved and exercised. Browser/mobile authenticated acceptance and actual Claude/ChatGPT OAuth/read/revoke/write checks remain open. See `docs/emba-pilot.md` for runnable local commands and migration/rollback boundaries.

## Reviewed portal and browser continuation - 2026-11-06

Current bounded completion is **37/51 tasks**. This supersedes earlier count snapshots, without closing the remaining live-pilot gates.

Implemented a transient structured Want proposal review: candidates are not stored until explicit first-party acceptance; conflicts show the current version; stale inference cannot overwrite corrections; context scopes cannot change; archived/needs-review matches require explicit reactivation. Exact operation retries are idempotent, and action JSON is byte-bounded before parsing. This is not a raw-conversation compiler or crisis classifier (6.3 remains open).

Added reviewed organizer announcement publication/correction and key-status controls, immutable history and member verification presentation. Production signer availability still defaults to unavailable. Review fixes use database timestamps, lock key status through verification, reauthorize after asynchronous panel loading, hide organizer metadata after demotion, and persist only canonical public SPKI material even if private PEM is accidentally submitted. Production custody remains open (4.5).

Activity starts, ends and deadlines now display in the trip timezone, with expandable exact UTC references. Tests cover Hanoi date rollover and Tallinn winter/summer offsets.

A disposable browser harness exercises actual portal components, actions and services with synthetic request-local identities. Chrome passed 18 interaction/access checks; full global styling and bundled font were then checked for keyboard persistence and no horizontal overflow at 320/390/1440 px. The harness refuses production mode and remote database URLs. It does not test actual OAuth or Next Server Action transport; tasks 2.5 and 8.2 remain partial. See docs/emba-browser-rehearsal.md.

Integrated verification: **59 test files / 462 tests passed**, 12 skipped (9 native-only and 3 opt-in production HTTP tests). **21 native PostgreSQL suites / 157 tests passed**, with the 3 opt-in HTTP tests skipped in that run; the separate production HTTP run then passed **3/3**. The latter starts the freshly built Next server against a generated disposable localhost database and tests anonymous/legacy-owner HTML, file, ICS and OG boundaries, old workspace tokens, classified magic links and an unaffected public-board control. Native announcement portal follow-up separately passed 17 focused tests. TypeScript, pilot ESLint, git diff --check, strict OpenSpec validation and the final production build passed. Browser and HTTP servers and the disposable native database were stopped.

The first broad test invocation was stopped because a CLI exclusion replaced the existing exclusions; rerunning with all exclusions passed. Vitest configuration now excludes ignored browser-tool artifacts so ordinary npm test avoids vendor tests. Vite 8.3.5 is declared directly for the local harness; no runtime dependency was added.

No hosted migration, deployment, provider provisioning, commit, push or real-member enrollment occurred. Live auth/provider accounts, production signer/compiler/embedding/worker boundaries, owner verification and exact retention/restore policy remain deferred. The prior deployed foundation is unchanged.

## Deletion and restore continuation - 2026-11-06

Completion remains **37/51**: this continuation strengthens the partial privacy and acceptance tasks without treating deferred production policy as resolved.

Deletion now locks activities referenced by historical commitments before purging old dependencies. Its native PostgreSQL regression proves the activity is locked before the purge proceeds. The member page reuses explicit privacy controls explaining withdrawal/access removal, retained public-board identity, names within organization publications, original signed authorship history, previously delivered assistant/export copies and unresolved backup timing.

Added 17 actual Chrome checks on a fresh synthetic fixture for transient proposal review, acceptance acknowledgement, conflicts, stale corrections, archived-want reactivation, cross-member review isolation, downloaded export contents, expired/fresh authentication, deletion and denial of the previous principal. Components, actions and services are real; authentication-age controls and browser transport remain synthetic. See docs/emba-browser-rehearsal.md.

Added an opt-in native PostgreSQL physical cold-backup rehearsal. It snapshots before deletion, captures the newer tombstone ledger separately, restores an isolated cluster/database, demonstrates resurrection without that ledger, imports it, then verifies denied stale sessions/agents/workers, purged personal rows, removed attribution and preserved unrelated-member data/delivery. It passed; this is not hosted backup-provider acceptance. See docs/emba-restore-rehearsal.md. The initial serial file copy exceeded the test timeout; the cleaned-up retry used bounded copy-only native parallel copying and passed in 7.04 seconds. Both clusters and scratch copies were cleaned up.

Verification this continuation: **44 focused application tests passed** (one native-only case skipped), **7 native privacy tests passed**, **1 physical restore test passed**, **17 new browser checks passed**, plus TypeScript, changed-file ESLint and one final production build. Prior full-suite counts above remain historical, not a new full-suite claim.

Remaining privacy gates include approved exact retention/publication policy, signed author-ID retention, stale invitation recipient-email cleanup, durable external tombstones and a real restore traffic barrier. No production migrations, deployment, provider provisioning, commit/push or real-member enrollment occurred. All temporary verification servers were stopped.

## Organizer acceptance continuation - 2026-11-06

Bounded task completion remains **37/51**; the real authenticated portal and provider/account acceptance remain deferred.

Four failing real-database page regressions reproduced organizer recipient-email/role metadata surviving late demotion or removal, and a revoked second organization remaining in trip selectors. The page now refreshes its loop list after other asynchronous reads, then checks first-party identity, selected-loop read access and management authority before returning. It hides organizer data after demotion and returns an unavailable state after selected membership or identity removal. Independent review confirmed these cases.

Two reproduced knowledge defects were also fixed: a revoked/obsolete document worker can no longer write failure state through an unguarded catch path, and document output uses the processing state from its final locked row. The new regressions failed before the fixes. Invitation/role review found no additional concrete service defect; a suspected lock cycle was traced and dismissed without speculative changes.

Shared resource controls and invitation acceptance/revocation controls now serve both the actual portal and the local browser harness. The organizer browser driver passed **17 new checks**, separate from the earlier 18 and 17. It covers invitation creation, wrong recipients, revoked/expired invitations, acceptance/replay, malformed upload rejection, processing/retry, correction/versioning, member citations/permissions and deletion of current/historical source access. Verified emails, expiry and failed-worker state are explicitly synthetic fixture controls; no email was sent. See docs/emba-browser-rehearsal.md.

Verification this continuation: **68 focused application tests passed**, **33 native PostgreSQL tests passed**, **17 organizer browser checks passed**, plus TypeScript, changed-file ESLint, whitespace check and one final production build. All browser/database verification processes stopped. These are scoped results, not a newly rerun full-suite count. An automatic approval-review usage failure briefly interrupted testing; the user requested continuation and the retry succeeded.

No hosted migration, deployment, provider provisioning, commit/push or real-member enrollment occurred. Production sign-in, actual Claude/ChatGPT connections, processing/signing custody and exact retention/restore operations remain open. The local expanded rehearsal remains available through npm run emba:browser.

## Announcement acceptance continuation - 2026-11-07

Task completion remains 37/51. Shared announcement presentation now serves the portal and the disposable browser harness; 15 new browser checks cover reviewed publication, corrections/history, inert content, permission denials, retirement and revocation warnings. Five recorded drivers now total 83 checks; this remains synthetic component/action/service acceptance, not real authentication or full Next transport.

Two reproduced loading windows could show a stale verified signature after key compromise. Signer resolution now precedes notice verification, and the final output transaction locks and refreshes all displayed notice keys for both member and organizer views. Six late-status variants preserve retired-key history and invalidate revoked/compromised keys. Locks protect the final transaction, not recall of already delivered output.

Verification: 19 announcement portal tests, 38 surrounding portal tests and 25 native PostgreSQL announcement tests passed. TypeScript and changed-file lint passed. Production key custody, sign-in, actual host acceptance, processing providers and exact retention policies remain deferred. No hosted migration, deployment or enrollment occurred.

One final production build passed after the harness stopped. Local browser and database verification processes are stopped; changes are committed locally without pushing.
