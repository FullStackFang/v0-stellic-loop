# Development Clerk OAuth setup

The `loop-mvp-auth` development instance is configured for a Claude connection. No production instance or user grant was changed. OAuth application scopes and explicit Claude admission still require the supported Dashboard steps below.

Inspect without mutation:

```powershell
node --env-file=.playwright-mcp/loop-mvp-auth.env scripts/emba-clerk-setup.mjs
```

Reapply the development security settings:

```powershell
$env:EMBA_CLERK_SETUP='1'
node --env-file=.playwright-mcp/loop-mvp-auth.env scripts/emba-clerk-setup.mjs --apply
Remove-Item Env:EMBA_CLERK_SETUP
```

The utility requires test keys and verifies the Backend API instance reports `development` before mutation. It uses native fetch with a 15-second timeout, refuses redirects, and prints only selected configuration fields. It does not read users, issue tokens, change memberships, or persist credentials. Keep the env file ignored. The script uses the documented [`/instance/oauth_application_settings` Backend API](https://raw.githubusercontent.com/clerk/openapi-specs/main/bapi/2026-05-12.yml).

Verified on November 7, 2026:

- Issuer: `https://skilled-buzzard-1683.clerk.accounts.dev`.
- Audience claims enabled; PKCE with S256 required.
- Opaque OAuth access tokens retained for online verification and revocation.
- CIMD published; only explicitly admitted clients permitted, including rejection of previously implicit clients.
- Dynamic client registration disabled.
- Public discovery advertises CIMD, S256, and token endpoint method `none`; it has no registration endpoint. Discovery briefly lagged the settings update, then reflected it on the next inspection.
- Default scopes and dynamic-client scope ceiling remain unchanged (`null`); custom scopes are not yet advertised.

Finish in the [Clerk Dashboard OAuth applications page](https://dashboard.clerk.com/last-active?path=oauth-applications), selecting **loop-mvp-auth → Development** first:

1. In **Scopes**, create and advertise `plan:read` (read permitted EMBA shared memory) and `group-memory:write` (contribute shared memory to groups the person belongs to). Custom scope definitions are managed in the Dashboard; see [Clerk OAuth scopes](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth).
2. In **Applications → Add application → Pre-register CIMD client**, enter `https://claude.ai/oauth/mcp-oauth-client-metadata`, select only those two application permissions, and choose **Allow client**. Verify **Explicitly allowed** and successful metadata fetch. Clerk always adds `offline_access` for refresh; this is not an additional application-data permission. See [Clerk CIMD management](https://clerk.com/docs/guides/configure/auth-strategies/oauth/client-id-metadata-documents).
3. In **Settings → Client onboarding**, restrict the dynamic-client allowed scopes and defaults to the two custom scope keys if configuring defaults. Do not include `offline_access` in the Backend API `default_scopes` array: Clerk rejects it there and manages it separately. Keep unknown-client admission and DCR disabled.

Claude's public metadata was fetched successfully: its `client_id` matches the URL above, its callback is exactly `https://claude.ai/api/mcp/auth_callback`, and its token endpoint authentication method is `none`. The hosted Claude apps use this identity. Claude Code has a separate identity and loopback callbacks; it is outside this initial hosted-Claude setup. See [Claude connector authentication](https://claude.com/docs/connectors/building/authentication).

The public BAPI OpenAPI and installed SDK do not expose custom scope catalog or CIMD admission CRUD. This utility deliberately does not invent Dashboard-private endpoints. An authenticated Dashboard session is required for those remaining configuration steps, not a new application architecture decision.

Clerk's [Next.js MCP guide](https://clerk.com/docs/nextjs/guides/ai/mcp/build-mcp-server) supports localhost resource identifiers, but this application's auth configuration requires an HTTPS audience. Do not configure `http://localhost:3000/api/mcp` as a valid application audience. Use an approved reachable HTTPS demo endpoint, with its exact `/api/mcp` URL consistently in audience verification and protected-resource metadata. No separate resource registration step is prescribed by that guide. Do not guess a deployment URL or treat local discovery as a successful hosted connection.

For subsequent Vercel setup, install the supported CLI with `npm i -g vercel`. The CLI was absent during this session, so provisioning/discovery used `npx vercel`; no global installation is claimed.

These checks verify provider configuration and public metadata only. Completing sign-in, consent, refresh, revocation, and scoped MCP tool calls requires the explicit client registration and an actual user connection. No such end-to-end acceptance is claimed here.

## Application configuration for the isolated demo

After selecting the isolated HTTPS deployment, configure its environment alongside the integration-managed Clerk keys:

```dotenv
LOOP_AUTH_PROVIDER=clerk
LOOP_AUTH_ISSUER=https://skilled-buzzard-1683.clerk.accounts.dev
LOOP_AUTH_JWKS_URL=https://skilled-buzzard-1683.clerk.accounts.dev/.well-known/jwks.json
LOOP_AUTH_CLIENT_IDS=https://claude.ai/oauth/mcp-oauth-client-metadata
CLERK_TELEMETRY_DISABLED=1
```

Set `LOOP_AUTH_AUDIENCE` to that deployment's exact HTTPS `/api/mcp` URL and use the same address when adding the Claude connector. The development keys are provisioned for development/preview; do not copy them into production. Point the demo at its own database and apply all migrations before enabling sign-in. A new login creates an identity only: an operator must bootstrap the synthetic cohort owner, and other accounts need explicit invitations. Do not use production member data for this acceptance exercise.
