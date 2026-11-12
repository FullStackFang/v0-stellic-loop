# Provider ownership review — November 8, 2026

**November 9 decision:** the user chose consistency through the existing Vercel Marketplace integrations for production and scaling. The direct-ownership recommendation below is superseded; retain the provider comparison as research. No ownership transfer occurred. The unused FullstackFang Direct organization was removed and its absence verified with the authenticated Supabase CLI. See `marketplace-exit.md` for evidence.

## Finding

The earlier recommendation conflated two decisions: choosing Clerk for identity/OAuth and provisioning Clerk through Vercel's native Marketplace. Marketplace provisioning was convenient for the agent, but the resulting split administration has made the operator's setup harder. It is not required to host Loop on Vercel or reproduce Living Brain's user sign-in flow.

Here, direct ownership means using the provider's hosted service in an operator-controlled account, not self-hosting an authentication server or database.

## Verified differences

| Concern | Native Vercel Marketplace | Direct provider account |
| --- | --- | --- |
| Service runtime | Clerk or Supabase still runs the service | Same provider runs the service |
| Billing and operator roles | Vercel invoice and team mapping; provider-specific restrictions | Provider invoice and workspace administration |
| App configuration | Some settings in Vercel, others in provider Dashboard | Provider Dashboard for service settings; Vercel for deployment environment |
| Environment variables | Integration synchronizes selected variables | Configure explicitly or use an optional existing-account connection |
| Product login | Configured in the auth provider and Loop | Same; purchase channel does not determine the member UI |

Clerk's native integration requires Vercel for application creation/deletion, billing and production-domain changes. Supabase's native integration similarly controls project creation, billing and synchronized owner roles; its current documentation also lists no custom-domain support. Both providers document the same service pricing through Marketplace as directly. Direct ownership removes those Marketplace administration constraints, not OAuth, domain or environment configuration itself.

Sources checked November 8, 2026:

- [Clerk Marketplace behavior and limitations](https://clerk.com/docs/guides/development/integrations/platforms/vercel-marketplace)
- [Supabase Marketplace behavior and limitations](https://supabase.com/docs/guides/integrations/vercel-marketplace)
- [Supabase Marketplace-to-direct project transfer](https://supabase.com/kb/troubleshooting/error-target-organization-is-not-managed-by-vercel-marketplace-during-project-transfer-5262c3)

## Revised architecture recommendation

Prefer operator-controlled direct provider accounts for future resources, reuse existing provisioned resources, and keep Vercel responsible for application deployment. This is a recommendation for administration, not a completed account transfer. Do not create replacement apps, unlink integrations, rotate credentials or move billing as part of this documentation review.

Keep the existing Clerk identity/OAuth adapter for the current MVP. This recommendation rests on its supported custom OAuth scopes and public-client identity controls, not on Marketplace convenience or existing implementation effort alone. Loop owns group membership, roles, consent, memory and audit in its database; Clerk supplies verified identity and OAuth. Clerk Organizations are not a prerequisite for Loop groups.

Supabase Auth remains a possible alternative, but it is not a drop-in replacement: its OAuth server is currently beta and its documented scopes are limited to standard identity scopes. Custom application scopes are not supported. OAuth access tokens otherwise carry normal user access plus a client ID, so sharing Supabase Auth across pet projects requires a review of every exposed API and client-aware policy, not just Loop's schema. Our current `plan:read` and `group-memory:write` contract must not be silently weakened to make a provider fit.

Sources: [Clerk custom scopes](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth), [Supabase OAuth scope limitations](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows), [Supabase OAuth beta status](https://supabase.com/docs/guides/auth/oauth-server/getting-started).

Database consolidation and authentication consolidation are distinct. Separate application schemas and runtime roles isolate database access; they do not create separate Supabase Auth user pools, signing settings, email templates or OAuth consent configuration. Retain the existing shared database plan and verify app cutovers separately. Do not change project-wide Auth configuration for Loop without assessing other consumers.

## Demo scope and operator acceptance

The first demo remains: sign in to Loop with email verification or Google, explicitly accept an invitation, connect an assistant, consent to a selected group, review a shared note, retrieve it and revoke access. The member never creates a Clerk developer account or configures OAuth scopes. Google production credentials, provider email delivery and deployment URLs still require correct operator setup whichever purchase channel is used.

Living Brain's public guide describes an account sign-in window from an MCP connection. Its login HTML does not establish its provider. Follow that user experience, not an inferred vendor choice. [Living Brain sign-in flow](https://docs.livingbrain.com/mcp/sign-in)

Raw transcript compilation and embedding funding are not prerequisites for this bounded shared-note demo. The original foundation's broader tasks and real-member policy gates remain open; the demo must not be described as completion of the whole foundation.

Before task 1.3 can close, record the actual provider workspace/application/instance, administrator entry point, owner, billing channel, settings authority and environment-variable source. The operator must be able to open and administer that exact instance. Record intended-host OAuth/read/revoke evidence separately. Before moving an existing instance, establish whether transfer is supported and how issuer/subject identities, grants, keys and connected apps are preserved or deliberately migrated; do not assume changing keys alone is sufficient.

No provider resources, billing, identities or deployed settings changed during this review.
