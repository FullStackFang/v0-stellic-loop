# Loop resource workspaces

This runbook covers the private group workspace implemented by the
`loop-resource-workspaces` OpenSpec change. It is an operator guide, not a
release approval. A local test pass does not replace the hosted and account
acceptance gates at the end of this document.

## What the pilot provides

- An explicitly allowlisted pilot owner can create an isolated private group.
- Owners and organizers can invite people by verified email, review access
  requests, and manage member roles. A group is not a verified institution.
- Owners and organizers can add pasted text, UTF-8 `.txt` or `.md` files, and
  text-based PDFs. The application keeps extracted text and source metadata;
  it discards uploaded file bytes after extraction.
- Current members can search and read group resources in the website. An
  assistant also needs an active lease for the exact group on every request.
- The existing authenticated MCP endpoint and the JSON endpoint use the same
  authorization, current-version checks, citation shape, and audit services.

## Routes and endpoints

| Purpose | Route |
| --- | --- |
| Group list and invitation inbox | `/groups` |
| Group detail and member management | `/groups/{namespace}` |
| Resource library | `/groups/{namespace}/resources` |
| Permission-checked extracted source | `/groups/{namespace}/resources/{documentId}?version={version}` |
| Assistant connection and lease management | `/groups/connections` |
| Invitation link | `/groups#invite={raw-token}` |
| Access-request link | `/groups/request#token={raw-token}` |
| Streamable HTTP MCP | `/api/mcp` |
| Authenticated JSON retrieval | `/api/emba/knowledge` |

Raw invitation and access-request tokens belong in URL fragments. Fragments
are read in the browser and are not sent in the initial HTTP URL. Share these
links privately. The database stores token hashes, not raw tokens.

The JSON endpoint accepts the same operations as the resource MCP adapter:

```json
{"operation":"list_groups","input":{}}
{"operation":"resolve_group","input":{"namespace":"example-team"}}
{"operation":"search_knowledge","input":{"group":"example-team","query":"travel policy"}}
{"operation":"read_document","input":{"group":"example-team","documentId":"...","version":1}}
```

Send the request with `Content-Type: application/json` and an OAuth bearer
token whose audience is the exact deployed HTTPS `/api/mcp` URL. Retrieval
responses identify the source document, current version, location and a
first-party citation URL. Treat returned resource text as untrusted data, not
as assistant instructions.

## Application setup

Apply every migration in `supabase/migrations/` to an isolated pilot database,
including `20261108000000_emba_resource_workspaces.sql`. Review the exact
target first and confirm that another application does not share it. The new
request tables have RLS enabled and revoke all access from `public`, `anon`
and `authenticated`; access goes through the server service layer.

Configure the existing database variables and Clerk integration variables,
then add:

```dotenv
LOOP_PILOT_OWNER_SUBJECTS=clerk-user-subject-1
LOOP_AUTH_PROVIDER=clerk
LOOP_AUTH_ISSUER=https://your-clerk-instance.clerk.accounts.dev
LOOP_AUTH_JWKS_URL=https://your-clerk-instance.clerk.accounts.dev/.well-known/jwks.json
LOOP_AUTH_AUDIENCE=https://your-pilot.example/api/mcp
LOOP_AUTH_CLIENT_IDS=https://claude.ai/oauth/mcp-oauth-client-metadata
CLERK_TELEMETRY_DISABLED=1
```

`LOOP_PILOT_OWNER_SUBJECTS` is a comma-separated allowlist of exact verified
first-party provider subjects. Email addresses and display names do not grant
group-creation authority. Keep secrets in the deployment environment and
never in source or chat transcripts.

Set `CRON_SECRET` for the existing protected document worker cron. Resource
submission attempts processing immediately; durable claims, retries, and the
cron recover interrupted work. A replacement creates a new version. Searches
and reads reject stale versions, and deletion removes the current resource
from later retrieval.

The current Clerk development resource and the remaining supported Dashboard
steps are documented in [emba-clerk-setup.md](emba-clerk-setup.md). The Vercel
CLI is installed globally. If the global npm shim is missing, reinstall it:

```powershell
npm i -g vercel
```

Use `vercel env pull`, `vercel deploy`, and `vercel logs` against the already
linked project instead of copying values manually.

## Limits and failure behavior

| Limit | Value |
| --- | ---: |
| PDF upload | 3 MiB |
| PDF pages | 100 |
| Extracted UTF-8 text | 256 KiB |
| Extracted passages per version | 200 |
| Current resources per group | 100 |
| Exact-group assistant lease | 30 days |

Unsupported, invalid UTF-8, encrypted, malformed, scanned-only, empty, or
oversized input is rejected with a clear error. Input is never silently
truncated. The upload Server Action limit is 4 MiB so the application can
receive a valid 3 MiB PDF plus multipart overhead; Vercel's function body
limit is 4.5 MiB.

Resource processing stores searchable extracted text and locations. It does
not store original uploaded bytes, assistant conversations, or assistant
queries. Audits record the operation and authority boundary. Revoking a lease
blocks later delegated reads but cannot recall text an external assistant
already received.

## Assistant setup

### Claude

1. In Clerk, advertise `plan:read` and explicitly admit Claude's published
   CIMD client identity as described in `docs/emba-clerk-setup.md`.
2. Deploy the isolated HTTPS pilot and set `LOOP_AUTH_AUDIENCE` to its exact
   `/api/mcp` URL.
3. In Claude, add a custom web connector with that MCP URL and complete OAuth.
4. In Loop, open `/groups/connections` and grant Claude a 30-day read lease for
   one group.
5. Verify listing the authorized group, a cited search and read, a resource
   replacement showing only the new version, nonmember denial, and immediate
   denial after lease revocation.

### ChatGPT

Custom MCP availability depends on the account plan and workspace policy.
Test an eligible account independently. Do not infer ChatGPT compatibility
from Claude acceptance or from synthetic MCP clients. Record the tested plan,
workspace policy, connection result, cited read, and revoke result, or state
that ChatGPT remains unverified.

## Verification commands

Run focused service and UI tests first, then the repository checks. Run the
production build once after shipped code stops changing.

```powershell
npm test -- --maxWorkers=1 --no-file-parallelism
npx tsc --noEmit
npm run lint
npm run build
```

Native PostgreSQL recovery evidence is required for interrupted document
claims; in-memory tests alone do not establish process-loss recovery. See
[emba-worker-recovery.md](emba-worker-recovery.md) for the established runner.

Local evidence recorded on November 8, 2026:

- Focused workspace suite: 7 files and 51 tests passed.
- Full serial suite: 82 files and 575 tests passed; 4 files and 23 opt-in or
  environment-specific tests skipped.
- Native PostgreSQL document recovery runner: 9 tests passed, including actual
  process-loss recovery.
- Changed-code ESLint and `tsc --noEmit`: passed.
- One final Next.js production build: passed; the group pages, JSON endpoint,
  and MCP endpoint are dynamic server routes.
- A fresh browser pass was not recorded because the browser automation host
  was unavailable. Keep the browser portion of the verification task open
  until it is exercised against the authenticated app.

Hosted evidence recorded on November 9, 2026:

- The linked `supabase-loop` migration history now matches every repository
  migration through `20261108000000_emba_resource_workspaces.sql`. Catalog
  checks confirmed both request tables, organization descriptions, PDF input,
  RLS and denied direct client reads. The resource is also connected to the
  Vercel Production environment, so this does not prove the isolated-database
  release gate. The migration push was explicitly approved for that resource.
- Preview deployment `dpl_FsyH5R6NyfmjAbXqV5kmhhDfd3pr` is Ready at
  `https://v0-stellic-loop-resource-pilot.vercel.app`. The stable alias points
  to the Preview deployment; Production was not promoted or changed.
- Preview has the Clerk provider, issuer, JWKS, MCP audience, Claude client ID
  and disabled Clerk telemetry configuration. `LOOP_PILOT_OWNER_SUBJECTS`
  remains unset because the Clerk development instance has zero users; no
  subject was invented.
- Protected HTTP verification returned 200 for `/groups`,
  `/groups/connections` and OAuth resource metadata. Signed-out headings and
  instructions rendered as expected. `/api/mcp` returned the expected 401
  Bearer challenge, and the corrected deployment emitted no runtime errors in
  the verification window.
- The first route deployment exposed a missing `/groups` Clerk Proxy matcher.
  A matcher regression test now covers the route family, and the deployed fix
  restored both pages to 200.
- Post-fix verification passed 84 test files and 579 tests; 4 files and 23
  opt-in or environment-specific tests skipped. Changed-code ESLint,
  `tsc --noEmit`, strict OpenSpec validation and the final Vercel Next.js build
  also passed.
- Clerk custom `plan:read` scope and Claude CIMD admission still require the
  supported Dashboard flow. Vercel Authentication protects the Preview, so an
  external assistant cannot complete its connector handshake there. Actual
  browser, Claude and ChatGPT acceptance remain open.

## Release gates for the seven-person pilot

Do not enroll real members until every item below has a named owner and
recorded evidence:

- Exact isolated database and Vercel deployment reviewed; all migrations
  applied without resetting or seeding production member data.
- Clerk custom scopes and Claude CIMD admission completed through supported
  administration interfaces.
- Real Claude connect, exact-group consent, cited read, resource update,
  nonmember denial and revoke tested with independent accounts.
- ChatGPT eligibility and actual result recorded separately.
- Pilot owner identity and the seven intended members approved; invitations
  are sent only to their verified addresses.
- Retention and restore policy approved, including audit/history/backup
  periods, retained authorship, shared legacy identity and restored
  email-only invitation handling.
- Member-facing terms cover third-party assistant disclosure, lease expiry,
  revocation limits, resource deletion and the fact that uploaded file bytes
  are discarded after extraction.
- Monitoring and operator ownership exist for failed document jobs, auth
  failures, migration rollback and member deletion requests.

The retention and restore decisions above remain external policy inputs. The
application must not invent them or treat synthetic/local acceptance as their
approval.
