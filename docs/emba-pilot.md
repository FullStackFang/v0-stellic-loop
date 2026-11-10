# Loop MCP pilot

This working tree contains an EMBA service, portal, and MCP pilot implementation. It is **not ready for real-member enrollment**. The earlier production deployment does not contain this continuation, and the hosted database has not received these migrations. `/emba` displays “Sign-in is not configured yet” until a trusted browser provider is connected; it does not use the legacy cookie or a request-selected person.

## Try it without accounts

Run `npm ci`, then `npm run emba:demo`. The rehearsal creates a disposable in-memory database, two synthetic Hanoi preferences, and a one-hour read lease. It calls the actual MCP SDK tool and revokes consent while the connection is open; the next read must be denied. It never connects to the application's database. `QB_DB=remote` is explicitly rejected.

For an MCP client that supports local stdio servers, launch from this repository:

```json
{
  "mcpServers": {
    "loop-demo": {
      "command": "node",
      "args": ["--conditions=react-server", "--import", "tsx", "scripts/emba-demo.ts", "--stdio"]
    }
  }
}
```

Set the client's working directory to this repository, or use absolute script paths and launch from the repository. Ask it to list your Hanoi memory. This is synthetic local rehearsal, not OAuth or Claude/ChatGPT remote-connector acceptance. The fixture resets whenever the process restarts. This small demo grants read-only authority; mutation tools cannot execute with that grant.

Run `npm run emba:rehearsal` for the larger synthetic Vietnam/Estonia scenario. It creates distinct member A, member B, organizer and nonmember identities, an ephemeral service-attested Ed25519 update, a versioned cited Hanoi bus passage, eight conditional opt-ins yielding six participants, a suppressed organizer report, and member A's private Hanoi afternoon context. It exercises registered MCP tools and resources, exact first-party commitment confirmation, replay/changed-payload denial, and read denial after lease revocation. The script refuses `QB_DB=remote` before opening the disposable test database. The standalone command passed locally after running outside the restrictive sandbox; see [local rehearsal evidence](emba-rehearsal-report.md). Neither command verifies a remote OAuth client or real browser account.

The portal provides reviewed structured preferences, leases and audit, invitations, trip resources, cited search, activity/consent flows, personal planning, feedback, and pilot export/delete actions. First-party actions reauthenticate through the server-only portal session; production sign-in remains unconfigured. Announcement publishing stays unavailable in the portal until a production signer is provisioned. See the [portal](emba-portal-report.md), [knowledge](emba-knowledge-report.md), [activity](emba-activity-report.md), and [privacy](emba-privacy-report.md) reports for implemented boundaries and tests.

## Server configuration

The remote server uses a provider-issued signed access token. Configure these environment variables only after choosing and provisioning that provider:

| Name | Meaning |
| --- | --- |
| `LOOP_AUTH_ISSUER` | Exact trusted issuer URL |
| `LOOP_AUTH_AUDIENCE` | Exact public MCP resource URL, e.g. `https://your-domain/api/mcp` |
| `LOOP_AUTH_JWKS_URL` | Provider's HTTPS signing-key endpoint |
| `LOOP_AUTH_CLIENT_IDS` | Comma-separated allowed OAuth client IDs |
| `DATABASE_URL` or `POSTGRES_URL` | Server database connection |
| `LOOP_ACCESS_TOKEN` | Explicit bearer credential for local production stdio only |

`npm run emba:mcp` runs stdio against the configured database and credential. There is no default principal, local owner bypass, or token issuance. The issuer/subject must already map to a verified person. A matching, unexpired first-party lease and token scope are required for each delegated read. Expired or revoked authority denies later calls on an existing connection.

HTTP surfaces include `/api/mcp`, `/api/emba/memory`, `/api/emba/documents/[id]`, and `/.well-known/oauth-protected-resource`. MCP exposes memory, bounded planning, source search/read, activities, updates, and prepare/execute tools for publication, commitments and name disclosure. Consequential execution requires exact single-use first-party approval and rechecks current authority. The `loop://memory` resource reads global personal memory. Loop scope is exact: a global lease does not authorize a loop-specific read. Responses must not be publicly cached.

These routes do not implement an OAuth authorization server or browser sign-in. The portal consent UI cannot be used by real members until its trusted browser provider is configured. Missing auth configuration fails closed. Provider discovery, PKCE, audience and verified client identity must be tested with the actual intended hosts before connecting real accounts. Never create identity mappings based on an unverified email or legacy magic link.

The scoped configured announcement signer uses server-only `LOOP_ANNOUNCEMENT_KEYS`; see [key custody](emba-signing-custody.md). No live key has been provisioned. The existing `CRON_SECRET` also authenticates the durable document worker, scheduled every five minutes in `vercel.json`; see [claims, retries and recovery](emba-worker-recovery.md). These engineering choices use the linked Vercel project and do not require selecting a new runtime.

Optional semantic retrieval uses the separate `supabase/optional-migrations/emba-vectors/001_vectors.sql` schema and Vercel AI Gateway's `openai/text-embedding-3-small` model. Apply that schema and resolve processing/funding gates before enabling `LOOP_EMBEDDINGS_ENABLED=true`. Scheduled/manual source processing and the explicit semantic MCP tool use the adapter; default keyword search stays local. Portal disclosure describes passage/query transmission. A live synthetic Gateway request returned HTTP 403 for the credit/billing gate, so successful live embeddings and retrieval quality remain unverified. See [knowledge processing](emba-knowledge-report.md) and [remaining inputs](emba-remaining-inputs.md).

## Migration and deployment

Apply the new `supabase/migrations/20261106*_emba_*.sql` and `20261107*_emba_*.sql` migrations in filename order through the normal migration workflow, after validating against a separate PostgreSQL database. Do not copy individual SQL fragments or mark migrations applied without executing them.

**Apply migrations before deploying this code.** Legacy getters reference the new classification columns. Classified pilot boards/workspaces deny legacy routes, even for old owners; the portal is present but production sign-in is pending. Keep existing public boards unclassified. Classification/import of previously public records needs a controlled transition and cache purge; prior public downloads cannot be recalled.

For disposable native PostgreSQL acceptance on Windows, extract `@embedded-postgres/windows-x64@18.6.0-beta.19` so its package entry exists at `.playwright-mcp/emba-postgres/binaries/package/dist/index.js`. These x64 executables also ran on this Windows ARM host. Prepare the ignored directory from PowerShell:

```powershell
New-Item -ItemType Directory -Force .playwright-mcp/emba-postgres/binaries
npm pack @embedded-postgres/windows-x64@18.6.0-beta.19 --pack-destination .playwright-mcp/emba-postgres
tar -xzf .playwright-mcp/emba-postgres/embedded-postgres-windows-x64-18.6.0-beta.19.tgz -C .playwright-mcp/emba-postgres/binaries
npm run emba:postgres-check
```

Run from the repository root; selected `lib/__tests__/emba-*.test.ts` paths can also be passed to `node scripts/emba-postgres-check.mjs`. The runner creates a temporary localhost cluster under `.playwright-mcp/emba-postgres`, listens on `127.0.0.1:55439`, applies the ordinary migrations, and runs Vitest with generated `SUPABASE_TEST_DB_URL` and `QB_DB=remote`. It does not use application database URLs. PostgreSQL stops in `finally`; temporary data directories remain for inspection. Run one instance at a time. This runner does not install the optional pgvector schema. Five vector-core checks previously passed on a separate real PostgreSQL/pgvector instance; the expanded optional integration suite's native rerun remains pending because the user requested no Docker startup. PGlite alone does not prove native multi-connection behavior. See [latest verification](emba-integration-verification.md) for current evidence.

Run `npm test`, `npx tsc --noEmit`, changed-file ESLint and one production build before release. PGlite tests exercise SQL constraints and transactions but do not satisfy the separate real-PostgreSQL concurrency/pgvector acceptance gate.

Vercel CLI can be invoked through `npx vercel`; installing it with `npm i -g vercel` enables direct `vercel env pull`, `vercel deploy`, and `vercel logs` commands. Confirm the linked project before applying environment or deployment changes.

## Remaining before a live pilot

Latest test, type, lint and build results are recorded in [emba-integration-verification.md](emba-integration-verification.md). Earlier focused reports preserve historical results and limits; their totals should not be treated as verification of subsequent changes.

Run `npm run emba:browser` for the disposable component/action/database browser rehearsal. See [browser evidence and limits](emba-browser-rehearsal.md): 18 interaction checks passed, followed by styled keyboard and 320/390/1440 px viewport checks. This uses synthetic identities and does not exercise provider login or Next Server Action transport.

After building the app, run the opt-in production HTTP regression against a fresh local database:

```powershell
$env:EMBA_PRODUCTION_HTTP_TEST='1'
try { node scripts/emba-postgres-check.mjs lib/__tests__/emba-legacy-http.test.ts }
finally { Remove-Item Env:EMBA_PRODUCTION_HTTP_TEST }
```

This test starts and stops the actual production server with generated local credentials. It covers classified legacy HTML/files/previews, old owner/workspace credentials and magic links, plus an unaffected public-board control. It does not supply an EMBA first-party session. The test is skipped during ordinary runs.

The [physical backup/restore rehearsal](emba-restore-rehearsal.md) also passed locally. It takes a clean PostgreSQL backup before deletion, restores it separately, and imports the newer deletion ledger before exercising readers and workers. It is opt-in because it stops and restarts the disposable test cluster. This does not establish hosted backup retention, external ledger durability, or an infrastructure traffic barrier. The browser report records another 17 checks for proposal review, export downloads, fresh-authentication requirements and deletion.

- Provision provider login and test Claude/ChatGPT OAuth, private read and revocation on real intended accounts.
- Connect verified browser sign-in; test portal keyboard/mobile, stale review and Tallinn/Hanoi timezone flows with distinct real member, organizer and nonmember accounts. Invitations, memory review/editing, connections and audit screens exist locally but are not yet reachable by real members.
- Provision scoped signing secrets/public registrations using the implemented custody adapter and perform the hosted rotation/compromise drill. Deploy the durable document worker after its migration and verify cron operation/recovery. Portal/MCP polling provides inbox updates; external push/email is optional.
- Resolve owner verification and exact audit/history/backup retention and publication-attribution policy. Pilot export/delete and tombstones exist, but restore requires an external current tombstone ledger and an isolated traffic barrier that the app does not operate.
- Complete browser/legacy-route and actual Claude/ChatGPT acceptance. The local SDK rehearsal is limited to its explicit service and MCP paths.

No raw conversations are accepted by the structured-memory service, and no private-conversation compiler exists. Bounded text/itinerary extraction, configured service-attested signing, durable scheduling and opt-in embedding/vector retrieval are implemented. Real identity setup, signing-secret provisioning, funded Gateway access, live retrieval-quality checks and owner processing/policy approval remain deployment gates; see [remaining inputs](emba-remaining-inputs.md). Operational failures should log sanitized categories, never tokens, private payloads or SQL parameters.

For rollback, disable pilot ingress and preserve private classification. Do not roll back to an older application that treats classified records as public, or drop classification columns to restore legacy access. Revoke affected leases and credentials through the provider if needed; consent revocation cannot erase data already returned to an external client.
