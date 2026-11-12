# Marketplace exit — November 8, 2026

## Superseded November 9: keep Marketplace

The user chose to retain Vercel Marketplace for consistent provisioning, billing and production scaling, and explicitly requested deletion of the unused FullstackFang Direct organization. The exit/transfer sequence below is historical and must not be executed. No project transfer took place. After the user reported completion, an authenticated `supabase orgs list --output json` check on November 9 confirmed organization `ntogasgqnlkagrdrpije` is no longer listed; both original Vercel-managed organizations remain. The unused organization cleanup is complete.

User requested direct provider administration and removal of unused Marketplace costs. No new Marketplace resources should be provisioned. This supersedes the earlier recommendation that applied direct ownership only to future resources. Preserve service/data continuity while moving existing resources; disconnecting a project does not cancel its subscription.

## Live inventory

Read through authenticated Vercel CLI resource inspection and Supabase CLI project/organization listing.

| Resource | Observed plan | Dependencies / exit status |
| --- | --- | --- |
| loop-mvp-auth | Clerk Hobby, installation billing | Connected to Loop development/preview; no production connection. Direct ownership transfer support not established. Preserve identity/config before any replacement or cancellation. |
| supabase-shared | Supabase Pro, installation billing | Active project fhtbbdmhfhrvuohcfkso; no Marketplace project connections, but existing Runs and migration consumers use it. |
| supabase-loop | Same Supabase Pro installation | Active gtxvuhxjequvhxuerfdw; connected to Loop preview/production. Preserve environment configuration before transfer. |
| supabase-stoop | Same Supabase Pro installation | Active zipuqihidfkynvoaejza; no Marketplace project connections does not establish no application consumers. |
| lodestone-db | Neon Free | Connected to v0-lodestone in all environments. |
| cornell-bingo-neon-db | Neon Free | Connected to v0-bingo-web-app in all environments. |

Roam and Voit now show Uninstalled in Vercel and are absent from the currently authenticated Supabase project list. This differs from the earlier migration checkpoint. Do not infer who removed them or whether they transferred to another account. Retained local backups/copies remain documented in database-consolidation.md. Other uninstalled Marketplace entries were not mutated. Unrelated projects in another Vercel-managed organization remain outside this audit's team scope.

Vercel `integration balance` returned no balance information for Clerk or Supabase. Plan inspection establishes subscription names, not actual invoice totals, add-ons or final accrued usage. Supabase Pro is installation/organization-level, not three independent Pro base subscriptions; each active database can add compute costs.

## Completed preparation

Created an empty directly managed Supabase organization via the authenticated CLI:

- Name: FullstackFang Direct
- ID/slug: ntogasgqnlkagrdrpije
- No database provisioned, paid plan selected, or existing project transferred.

The available CLI can create organizations but has no project-transfer command. Browser control was unavailable in the current session. No cancellations, deletions, resource disconnections or paid upgrades have occurred.

## Remaining sequence

1. Review the destination plan and eligibility for the existing shared project. Transfer supabase-shared using Supabase Project Settings → General → Transfer project → FullstackFang Direct. A paid-to-Free transfer may cause brief downtime and lose paid features; do not assume all three projects fit the two-active-Free-project quota.
2. Verify database, auth, storage and app connections after transfer. Preserve keys/connection settings securely and account for Marketplace environment synchronization before transferring connected source projects.
3. Complete outstanding Loop/Stoop app cutovers and final-delta verification before retiring source databases, or transfer those projects if they must remain active. Their copied snapshots alone do not prove safe retirement.
4. Review Clerk ownership transfer/replacement and Neon transfer paths under the user's direct accounts. Free resources still need ownership work but have no demonstrated paid base subscription to cancel now.
5. After every required resource has moved or been deliberately retired, remove the empty Marketplace installations and verify provider plan status and final Vercel invoices. Historical usage may remain payable after exit.

Sources: [Supabase outbound transfer support](https://supabase.com/kb/troubleshooting/error-target-organization-is-not-managed-by-vercel-marketplace-during-project-transfer-5262c3), [transfer prerequisites and billing](https://supabase.com/docs/guides/platform/project-transfer), [Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq), [Clerk Marketplace restrictions](https://clerk.com/docs/guides/development/integrations/platforms/vercel-marketplace).
